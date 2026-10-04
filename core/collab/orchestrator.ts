import { existsSync, symlinkSync } from "node:fs";
import { join } from "node:path";

import type { ChikaimaDatabase } from "../db/client.js";
import { badRequest } from "../errors.js";
import { LLMService } from "../chat/llmService.js";
import type { ChatMessage, MessageContentPart } from "../providers/types.js";
import { getConfig } from "../config/index.js";
import { effectivePermissions, inScope, needsApproval, type ApprovalKind, type Autonomy, type Permission } from "./capabilities.js";
import type { CommandResult } from "./commands.js";
import { GitRepo } from "./git.js";
import { browsePreview, getPreviewManager, screenshotPreview } from "./preview.js";
import {
  implementerPrompt,
  leadPlanPrompt,
  leadSummaryPrompt,
  parseAgentTurn,
  parsePlan,
  reviewerPrompt,
  type DecisionPolicy,
  type PlanStep,
  type ReviewVerdict,
  type ToolOptions,
  type WorkspaceAction,
} from "./protocol.js";
import { CollabRepository, type CollabMemberRow, type CollabMessageKind, type CollabRunRow, type CollabTeamRow } from "./repository.js";
import { getExecutor, worktreeDir, type Executor } from "./sandbox.js";
import { unifiedDiff, Workspace } from "./workspace.js";

/** Calls a model by its `ai_models` id. Injected so tests (and future transports) can stand in for real providers. */
export interface CollabModelClient {
  complete(modelId: string, messages: ChatMessage[]): Promise<string>;
}

const COLLAB_MAX_OUTPUT_TOKENS = 8192;
const MAX_AGENT_TURNS = 12;
const MAX_IDLE_TURNS = 2;
const MAX_DIFF_CHARS = 60_000;
const MAX_DETAIL_CHARS = 200_000;
const DEFAULT_APPROVAL_POLL_MS = 1_000;
const DEPLOY_TIMEOUT_MS = 15 * 60_000;

/** Calls the team member's configured model through the normal provider adapters. */
export class ProviderModelClient implements CollabModelClient {
  private readonly llm: LLMService;

  constructor(private readonly userId: string, db: ChikaimaDatabase) {
    this.llm = new LLMService(db);
  }

  async complete(modelId: string, messages: ChatMessage[]): Promise<string> {
    const { model, provider } = this.llm.resolveModelAndProvider(this.userId, modelId);
    // resolveModelAndProvider falls back to the default model; a team seat must never silently change models.
    if (model.id !== modelId) {
      throw badRequest("A team member's model is no longer enabled. Update the team before running it again.");
    }
    return this.llm.generateReply(provider, model, messages, { maxTokens: COLLAB_MAX_OUTPUT_TOKENS });
  }
}

export interface Vote {
  memberId: string;
  precedence: number;
  vote: "approve" | "reject" | null;
}

/**
 * Turns reviewer votes into a decision under the team's policy. Abstentions
 * (unparseable replies) are ignored; a step with reviewers but no counted
 * vote is rejected rather than slipped through.
 */
export function decide(policy: DecisionPolicy, votes: Vote[]): { approved: boolean; reason: string } {
  const counted = votes.filter((vote) => vote.vote !== null).sort((a, b) => a.precedence - b.precedence);
  if (votes.length === 0) return { approved: true, reason: "No reviewers assigned, so the change was kept." };
  if (counted.length === 0) return { approved: false, reason: "No reviewer returned a readable verdict." };

  const approvals = counted.filter((vote) => vote.vote === "approve").length;
  const rejections = counted.length - approvals;
  const top = counted[0]!;

  switch (policy) {
    case "unanimous":
      return rejections === 0
        ? { approved: true, reason: `All ${approvals} reviewer(s) approved.` }
        : { approved: false, reason: `${rejections} of ${counted.length} reviewer(s) rejected; unanimity required.` };
    case "precedence":
      return { approved: top.vote === "approve", reason: `Highest-ranked reviewer (#${top.precedence}) ${top.vote === "approve" ? "approved" : "rejected"}.` };
    case "majority":
    default:
      if (approvals !== rejections) {
        return { approved: approvals > rejections, reason: `${approvals} approve, ${rejections} reject.` };
      }
      return {
        approved: top.vote === "approve",
        reason: `Tied ${approvals}–${rejections}; highest-ranked reviewer (#${top.precedence}) ${top.vote === "approve" ? "approved" : "rejected"}.`,
      };
  }
}

class RunCancelled extends Error {}
class BudgetExhausted extends Error {}

/** What an agent is doing right now, attached to its status messages so the UI can show a live team roster. */
export type AgentActivity = "planning" | "coding" | "reviewing" | "testing" | "waiting" | "summarizing" | "idle";

interface StepOutcome {
  index: number;
  assignee: string;
  instruction: string;
  status: "approved" | "rejected" | "no_changes";
  revisions: number;
  files: string[];
  reason: string;
  commit?: string | null;
}

/** Where a step works: the team folder itself, or (in parallel mode) its own git worktree. */
interface StepContext {
  ws: Workspace;
  repo: GitRepo | null;
  worktree: boolean;
}

interface ActionResult {
  text: string;
  image?: string;
}

export interface OrchestratorOptions {
  /** How often a run waiting on a human re-checks the approval. */
  approvalPollMs?: number;
  /** false forces command execution off; true requires `runCommand` or a configured executor. */
  commandsEnabled?: boolean;
  /** Replaces the team's executor for every command (tests). */
  runCommand?: (cwd: string, command: string) => Promise<CommandResult>;
}

/**
 * Drives one collaboration run end to end, as a supervised team:
 *
 *   lead plans → implementer edits (within its scope and permissions)
 *     → its assigned reviewers vote → testers write and run tests
 *     → the human approves (supervised) → committed, or reverted and sent
 *       back with feedback, at most `maxRevisions` times.
 *
 * With git, the run works on its own branch, every kept step is a commit,
 * and merging into the starting branch is the supervisor's call. In
 * parallel mode, different implementers work at once in separate git
 * worktrees and their steps are merged in precedence order. Every model
 * call counts against the team's budget.
 */
export class CollabOrchestrator {
  private readonly repo: CollabRepository;
  private readonly approvalPollMs: number;
  private readonly options: OrchestratorOptions;

  private run!: CollabRunRow;
  private team!: CollabTeamRow;
  private members: CollabMemberRow[] = [];
  private main!: StepContext;
  private executor: Executor | null = null;
  private calls = 0;

  constructor(
    db: ChikaimaDatabase,
    private readonly client: CollabModelClient,
    options: OrchestratorOptions = {},
  ) {
    this.repo = new CollabRepository(db);
    this.approvalPollMs = options.approvalPollMs ?? DEFAULT_APPROVAL_POLL_MS;
    this.options = options;
  }

  async execute(runId: string): Promise<CollabRunRow> {
    const run = this.repo.getRun(runId);
    if (!run) throw new Error(`Run ${runId} not found.`);
    this.run = run;
    if (run.status === "cancelling") {
      this.finish("cancelled", { steps: [] }, null);
      return this.repo.getRun(runId)!;
    }

    this.team = this.repo.getTeam(run.teamId)!;
    this.members = this.repo.listMembers(this.team.id);
    const outcomes: StepOutcome[] = [];
    let baseBranch: string | null = null;
    let runBranch: string | null = null;

    this.repo.updateRun(run.id, { status: "running", startedAt: new Date().toISOString() });
    this.log(null, "system", `Run started on "${this.team.folder}" with ${this.members.length} agent(s), ${this.team.autonomy} autonomy.`);

    try {
      const ws = Workspace.open(this.team.folder);
      this.main = { ws, repo: this.team.gitEnabled ? new GitRepo(ws.root) : null, worktree: false };
      this.executor = this.resolveExecutor(ws.root);

      if (this.main.repo) ({ baseBranch, runBranch } = await this.startBranch(this.main.repo));

      const implementers = this.members.filter((member) => member.role === "implementer");
      if (implementers.length === 0) throw badRequest("The team needs at least one implementer.");
      const lead = this.members.find((member) => member.role === "lead") ?? null;

      const steps = await this.plan(lead, implementers);
      if (this.team.parallel && this.main.repo && runBranch) {
        outcomes.push(...(await this.runParallel(steps, implementers, runBranch)));
      } else {
        for (const [index, step] of steps.entries()) {
          outcomes.push(await this.runStep(implementers.find((member) => member.precedence === step.assignee)!, step, index, this.main));
        }
      }

      if (this.main.repo && baseBranch && runBranch) await this.finishBranch(this.main.repo, baseBranch, runBranch, lead, outcomes);
      const summary = await this.summarize(lead, outcomes);
      this.finish("completed", { steps: outcomes, summary, model_calls: this.calls, base_branch: baseBranch, run_branch: runBranch }, null);
    } catch (error) {
      // Only throw away git state once the run's own branch exists: before that, uncommitted
      // changes in the folder are the user's (e.g. the "folder has uncommitted changes" refusal).
      this.main?.ws.revert();
      if (this.main?.repo && baseBranch && runBranch) {
        await this.discard(this.main);
        await this.abandonBranch(this.main.repo, baseBranch, runBranch);
      }
      if (error instanceof RunCancelled) {
        this.log(null, "system", "Run cancelled; edits from the step in progress were reverted.");
        this.finish("cancelled", { steps: outcomes, model_calls: this.calls }, null);
      } else {
        const message = error instanceof Error ? error.message : String(error);
        this.log(null, "error", message);
        this.finish("failed", { steps: outcomes, model_calls: this.calls }, message);
      }
    }
    return this.repo.getRun(runId)!;
  }

  private resolveExecutor(folderRoot: string): Executor | null {
    if (this.options.commandsEnabled === false) return null;
    const runCommand = this.options.runCommand;
    if (runCommand) {
      return { kind: "host", run: (command, cwd) => runCommand(cwd, command), previewPorts: async () => ({ bind: 0, host: 0 }), dispose: async () => {} };
    }
    return getExecutor(this.team.id, folderRoot);
  }

  // --- git: one branch per run ---------------------------------------------------

  private async startBranch(repo: GitRepo): Promise<{ baseBranch: string; runBranch: string }> {
    if (await repo.ensureRepo()) this.log(null, "system", "Turned the folder into a git repository with an initial commit, so every step can be tracked and undone.");
    if (await repo.isDirty()) {
      throw badRequest("The folder has uncommitted changes. Commit them from the Git panel (or discard them) before starting a run.");
    }
    const baseBranch = await repo.currentBranch();
    const runBranch = `chikaima/run-${this.run.id.slice(0, 8)}`;
    await repo.createBranch(runBranch);
    await repo.checkout(runBranch);
    this.repo.updateRun(this.run.id, { baseBranch, runBranch });
    this.log(null, "system", `Working on branch ${runBranch} (from ${baseBranch}).`, { git: "branch", branch: runBranch, base: baseBranch });
    return { baseBranch, runBranch };
  }

  /** Asks to merge the run's commits into the starting branch (automatic when autonomous), then returns the folder to that branch. */
  private async finishBranch(repo: GitRepo, baseBranch: string, runBranch: string, lead: CollabMemberRow | null, outcomes: StepOutcome[]): Promise<void> {
    const ahead = await repo.commitsAhead(baseBranch, runBranch);
    if (ahead === 0) {
      await repo.checkout(baseBranch);
      await repo.deleteBranch(runBranch);
      this.log(null, "system", `No changes were kept, so ${runBranch} was removed.`, { git: "branch_removed" });
      return;
    }

    let approved = true;
    let note: string | null = null;
    if (needsApproval(this.team.autonomy as Autonomy, { kind: "merge" })) {
      const kept = outcomes.filter((outcome) => outcome.status === "approved");
      ({ approved, note } = await this.awaitApproval(lead, "merge", `Merge ${ahead} commit(s) from ${runBranch} into ${baseBranch}? Kept: ${kept.map((o) => `step ${o.index + 1}`).join(", ") || "none"}.`, {
        branch: runBranch,
        base: baseBranch,
        commits: (await repo.log(ahead, runBranch)).map((commit) => ({ hash: commit.shortHash, subject: commit.subject })),
      }));
    }

    await repo.checkout(baseBranch);
    if (!approved) {
      this.log(null, "system", `Not merged${note ? ` (${note})` : ""}. The work stays on branch ${runBranch}.`, { git: "kept", branch: runBranch });
      return;
    }
    if (await repo.merge(runBranch, `Merge ${runBranch}: ${this.run.task.split("\n")[0]!.slice(0, 72)}`)) {
      await repo.deleteBranch(runBranch);
      this.log(null, "system", `Merged ${ahead} commit(s) into ${baseBranch}.`, { git: "merged", branch: runBranch, base: baseBranch });
    } else {
      this.log(null, "error", `Merging into ${baseBranch} conflicted (it changed during the run). The work stays on branch ${runBranch}; merge it from the Git panel.`, { git: "conflict" });
    }
  }

  private async abandonBranch(repo: GitRepo, baseBranch: string, runBranch: string): Promise<void> {
    try {
      await repo.checkout(baseBranch);
      if ((await repo.commitsAhead(baseBranch, runBranch)) === 0) await repo.deleteBranch(runBranch);
      else this.log(null, "system", `Steps completed before the run stopped are on branch ${runBranch}.`, { git: "kept", branch: runBranch });
    } catch {
      // best effort: the folder is left on the run branch
    }
  }

  // --- planning and steps ----------------------------------------------------

  private async plan(lead: CollabMemberRow | null, implementers: CollabMemberRow[]): Promise<PlanStep[]> {
    const fallback: PlanStep[] = [{ assignee: implementers[0]!.precedence, instruction: this.run.task }];
    if (!lead) {
      this.log(null, "plan", `No lead on this team; #${implementers[0]!.precedence} ${implementers[0]!.name} takes the whole task.`, { steps: fallback });
      return fallback;
    }

    this.status(lead, "planning", "is planning the work.");
    const reply = await this.call(lead, [{ role: "user", content: leadPlanPrompt(this.like(lead), this.members.map((m) => this.like(m)), this.run.task, this.main.ws.list()) }]);
    this.status(lead, "idle", "finished planning.");
    const valid = new Set(implementers.map((member) => member.precedence));
    const steps = parsePlan(reply).map((step) => (valid.has(step.assignee) ? step : { ...step, assignee: implementers[0]!.precedence }));
    const plan = steps.length > 0 ? steps : fallback;
    this.log(lead.id, "plan", steps.length > 0 ? reply : `${lead.name}'s plan could not be read; assigning the whole task to #${implementers[0]!.precedence}.`, { steps: plan });
    return plan;
  }

  /**
   * Parallel mode: consecutive steps for different implementers form a
   * wave and run at once, each in its own worktree branched from the run
   * branch. Approved steps are merged back in precedence order; a step that
   * conflicts with an earlier merge is redone on the merged result.
   */
  private async runParallel(steps: PlanStep[], implementers: CollabMemberRow[], runBranch: string): Promise<StepOutcome[]> {
    const waves: Array<Array<{ step: PlanStep; index: number }>> = [];
    for (const [index, step] of steps.entries()) {
      const wave = waves.at(-1);
      if (wave && !wave.some((entry) => entry.step.assignee === step.assignee)) wave.push({ step, index });
      else waves.push([{ step, index }]);
    }

    const outcomes: StepOutcome[] = [];
    const memberFor = (step: PlanStep) => implementers.find((member) => member.precedence === step.assignee)!;
    for (const wave of waves) {
      if (wave.length === 1) {
        outcomes.push(await this.runStep(memberFor(wave[0]!.step), wave[0]!.step, wave[0]!.index, this.main));
        continue;
      }

      this.log(null, "system", `Running ${wave.length} steps in parallel: ${wave.map(({ step, index }) => `step ${index + 1} (${memberFor(step).name})`).join(", ")}.`);
      const lanes = await Promise.all(
        wave.map(async ({ step, index }) => {
          const path = join(worktreeDir(this.team.id), `${this.run.id.slice(0, 8)}-s${index + 1}`);
          const branch = `${runBranch}-s${index + 1}`;
          await this.main.repo!.addWorktree(path, branch, runBranch);
          // Host commands in a worktree can reuse the main folder's installed dependencies.
          const deps = join(this.main.ws.root, "node_modules");
          if (this.executor?.kind === "host" && existsSync(deps) && !existsSync(join(path, "node_modules"))) symlinkSync(deps, join(path, "node_modules"), "dir");
          return { step, index, path, branch, ctx: { ws: Workspace.at(path), repo: new GitRepo(path), worktree: true } as StepContext };
        }),
      );

      try {
        const settled = await Promise.allSettled(lanes.map((lane) => this.runStep(memberFor(lane.step), lane.step, lane.index, lane.ctx)));
        const failure = settled.find((result): result is PromiseRejectedResult => result.status === "rejected");
        if (failure) throw failure.reason;

        const results = lanes
          .map((lane, position) => ({ lane, outcome: (settled[position] as PromiseFulfilledResult<StepOutcome>).value }))
          .sort((a, b) => a.lane.step.assignee - b.lane.step.assignee);
        const waveOutcomes: StepOutcome[] = [];
        for (const { lane, outcome } of results) {
          if (outcome.status !== "approved" || !outcome.commit) {
            waveOutcomes.push(outcome);
            continue;
          }
          if (await this.main.repo!.merge(lane.branch, `Merge step ${lane.index + 1} (${outcome.assignee})`)) {
            this.log(null, "system", `Merged step ${lane.index + 1} (${outcome.assignee}) into ${runBranch}.`, { git: "merged_step", step: lane.index });
            waveOutcomes.push(outcome);
          } else {
            this.log(null, "system", `Step ${lane.index + 1} conflicts with work merged before it (higher precedence wins); ${outcome.assignee} will redo it on the merged code.`, {
              git: "conflict",
              step: lane.index,
            });
            waveOutcomes.push(await this.runStep(memberFor(lane.step), lane.step, lane.index, this.main));
          }
        }
        outcomes.push(...waveOutcomes.sort((a, b) => a.index - b.index));
      } finally {
        for (const lane of lanes) {
          await this.main.repo!.removeWorktree(lane.path);
          await this.main.repo!.deleteBranch(lane.branch);
        }
      }
    }
    return outcomes;
  }

  /** The members who check an implementer's work: its explicit `reviewedBy` list, or everyone with the review permission. Testers run after the others. */
  private reviewersFor(implementer: CollabMemberRow): { reviewers: CollabMemberRow[]; testers: CollabMemberRow[] } {
    const pool =
      implementer.reviewedBy.length > 0
        ? this.members.filter((member) => implementer.reviewedBy.includes(member.precedence))
        : this.members.filter((member) => effectivePermissions(member.role, member.permissions).has("review"));
    const others = pool.filter((member) => member.id !== implementer.id);
    return { reviewers: others.filter((member) => member.role !== "tester"), testers: others.filter((member) => member.role === "tester") };
  }

  private async runStep(implementer: CollabMemberRow, step: PlanStep, index: number, ctx: StepContext): Promise<StepOutcome> {
    const { reviewers, testers } = this.reviewersFor(implementer);
    const policy = this.team.decisionPolicy as DecisionPolicy;
    const where = ctx.worktree ? { step: index, worktree: true } : { step: index };
    let feedback: string | null = null;

    for (let revision = 0; ; revision++) {
      const base = { index, assignee: implementer.name, instruction: step.instruction, revisions: revision };
      this.status(implementer, "coding", `is working on step ${index + 1}${revision > 0 ? ` (revision ${revision})` : ""}.`, { ...where, revision });
      const { note } = await this.agentLoop(
        implementer,
        "work",
        implementerPrompt(this.like(implementer), this.likeAll(), this.permissionsOf(implementer), this.toolOptions(), this.run.task, step.instruction, ctx.ws.list()),
        feedback ? `Your previous attempt was rejected and has been reverted. Feedback:\n\n${feedback}\n\nRedo the step addressing it.` : "Begin the step.",
        ctx,
      );
      this.status(implementer, "idle", `finished step ${index + 1}.`, where);

      if (ctx.ws.changes().length === 0 && !(ctx.repo && (await ctx.repo.isDirty()))) {
        ctx.ws.commit();
        this.log(null, "decision", `Step ${index + 1} made no changes.`, { ...where, approved: true, revision });
        return { ...base, status: "no_changes", files: [], reason: "No files changed." };
      }
      const diff = this.diffOf(ctx);
      this.log(implementer.id, "change", diff, { ...where, revision, files: this.changedFiles(ctx), files_detail: this.filesDetail(ctx) });

      // 1. Reviewers vote under the team's decision policy.
      const comments: string[] = [];
      const votes: Vote[] = [];
      for (const reviewer of reviewers) {
        this.status(reviewer, "reviewing", `is reviewing step ${index + 1}.`, where);
        const verdict = await this.review(reviewer, implementer, step, note, diff, ctx);
        this.status(reviewer, "idle", `reviewed step ${index + 1}.`, where);
        votes.push({ memberId: reviewer.id, precedence: reviewer.precedence, vote: verdict.vote });
        if (verdict.vote !== "approve" && verdict.comments) comments.push(`${reviewer.name} (#${reviewer.precedence}): ${verdict.comments}`);
        this.log(reviewer.id, "review", verdict.comments, { ...where, revision, vote: verdict.vote });
      }
      let decision = decide(policy, votes);

      // 2. Tests: tester agents (who may add tests), or the team's test command on its own.
      if (decision.approved) {
        const tested = await this.test(testers, implementer, step, note, index, revision, ctx);
        if (tested) {
          decision = tested;
          if (!tested.approved) comments.push(tested.reason);
        }
      }

      // 3. The human, when the team is supervised.
      if (decision.approved && needsApproval(this.team.autonomy as Autonomy, { kind: "step" })) {
        const human = await this.awaitApproval(implementer, "step", `Step ${index + 1} by ${implementer.name} is ready for your approval: ${step.instruction}`, {
          ...where,
          files: this.changedFiles(ctx),
          diff: this.diffOf(ctx),
          files_detail: this.filesDetail(ctx),
        });
        if (!human.approved) {
          decision = { approved: false, reason: `Rejected by the supervisor${human.note ? `: ${human.note}` : "."}` };
          comments.push(`Supervisor: ${human.note || "Rejected without a note; reconsider the approach."}`);
        }
      }

      const files = this.changedFiles(ctx);
      if (decision.approved) {
        ctx.ws.commit();
        const commit = ctx.repo ? await ctx.repo.commitAll(`Step ${index + 1}: ${step.instruction.split("\n")[0]!.slice(0, 64)} (${implementer.name})`) : null;
        this.log(null, "decision", `Step ${index + 1} approved: ${decision.reason}`, { ...where, revision, approved: true, policy, files, commit });
        return { ...base, status: "approved", files, reason: decision.reason, commit };
      }
      this.log(null, "decision", `Step ${index + 1} rejected: ${decision.reason}`, { ...where, revision, approved: false, policy, files });
      await this.discard(ctx);
      if (revision >= this.team.maxRevisions) {
        this.log(null, "system", `Step ${index + 1} abandoned after ${revision + 1} attempt(s); its changes were reverted.`, where);
        return { ...base, status: "rejected", files, reason: decision.reason };
      }
      feedback = comments.length > 0 ? comments.join("\n\n") : decision.reason;
    }
  }

  private async review(reviewer: CollabMemberRow, author: CollabMemberRow, step: PlanStep, note: string | null, diff: string, ctx: StepContext): Promise<ReviewVerdict> {
    const system = reviewerPrompt(this.like(reviewer), this.likeAll(), this.permissionsOf(reviewer), this.toolOptions(), this.run.task, step.instruction, this.like(author), note, diff);
    const { verdict } = await this.agentLoop(reviewer, "review", system, "Review the change.", ctx);
    return verdict ?? { vote: null, comments: `${reviewer.name} did not return a verdict.` };
  }

  /** Runs the test stage. Returns null when there is nothing to test with, so the reviewers' decision stands. */
  private async test(
    testers: CollabMemberRow[],
    author: CollabMemberRow,
    step: PlanStep,
    note: string | null,
    index: number,
    revision: number,
    ctx: StepContext,
  ): Promise<{ approved: boolean; reason: string } | null> {
    if (testers.length > 0) {
      for (const tester of testers) {
        this.status(tester, "testing", `is testing step ${index + 1}.`, { step: index });
        const verdict = await this.review(tester, author, step, note, this.diffOf(ctx), ctx);
        this.status(tester, "idle", `tested step ${index + 1}.`, { step: index });
        this.log(tester.id, "review", verdict.comments, { step: index, revision, vote: verdict.vote, stage: "test" });
        if (verdict.vote !== "approve") {
          return { approved: false, reason: `${tester.name} (#${tester.precedence}) failed the change: ${verdict.comments || "no verdict."}` };
        }
      }
      return { approved: true, reason: `Reviewed and passed testing by ${testers.map((tester) => tester.name).join(", ")}.` };
    }
    if (!this.team.testCommand || !this.executor) return null;

    const result = await this.execCommand(null, this.team.testCommand, ctx.ws.root, { step: index, revision, stage: "test" });
    return result.exitCode === 0
      ? { approved: true, reason: `Approved by reviewers and \`${this.team.testCommand}\` passed.` }
      : { approved: false, reason: `\`${this.team.testCommand}\` failed (exit ${result.exitCode ?? "timeout"}):\n${result.output}` };
  }

  private async summarize(lead: CollabMemberRow | null, outcomes: StepOutcome[]): Promise<string> {
    const outcomeText = outcomes
      .map(
        (outcome) =>
          `Step ${outcome.index + 1} (${outcome.assignee}): ${outcome.status} after ${outcome.revisions + 1} attempt(s). ${outcome.reason}${outcome.files.length ? ` Files: ${outcome.files.join(", ")}` : ""}`,
      )
      .join("\n");
    if (lead) this.status(lead, "summarizing", "is writing the report.");
    const summary = lead ? await this.call(lead, [{ role: "user", content: leadSummaryPrompt(this.like(lead), this.likeAll(), this.run.task, outcomeText) }]) : outcomeText;
    if (lead) this.status(lead, "idle", "finished the report.");
    this.log(lead?.id ?? null, "summary", summary);
    return summary;
  }

  // --- the agent loop ----------------------------------------------------------

  /**
   * One agent working through tag replies until it is finished: `<done/>` for
   * implementers, a `<verdict>` for reviewers and testers. Actions run
   * against the step's folder subject to the agent's permissions and scope.
   */
  private async agentLoop(member: CollabMemberRow, mode: "work" | "review", system: string, opening: string, ctx: StepContext): Promise<{ note: string | null; verdict: ReviewVerdict | null }> {
    const messages: ChatMessage[] = [
      { role: "system", content: system },
      { role: "user", content: opening },
    ];
    let note: string | null = null;
    let idle = 0;

    for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
      const reply = await this.call(member, messages);
      messages.push({ role: "assistant", content: reply });
      const parsed = parseAgentTurn(reply);

      const results: ActionResult[] = [];
      for (const action of parsed.actions) results.push(await this.apply(member, action, ctx));
      if (parsed.message) {
        note = parsed.message;
        this.log(member.id, "message", parsed.message);
      }
      if (mode === "review" && parsed.verdict) return { note, verdict: parsed.verdict };
      if (mode === "work" && parsed.done) break;

      if (parsed.actions.length === 0) {
        if (++idle >= MAX_IDLE_TURNS) break;
        messages.push({ role: "user", content: mode === "work" ? "Use the action tags to work on the folder, or reply <done/> if the step is complete." : "Reply with your <verdict> and <comments>." });
        continue;
      }
      idle = 0;
      const text = results.map((result) => result.text).join("\n\n");
      const images = results.flatMap((result) => (result.image ? [result.image] : []));
      messages.push({
        role: "user",
        content: images.length > 0 ? [{ type: "text", text }, ...images.map((data): MessageContentPart => ({ type: "image", mime_type: "image/png", data }))] : text,
      });
    }
    return { note, verdict: null };
  }

  private async apply(member: CollabMemberRow, action: WorkspaceAction, ctx: StepContext): Promise<ActionResult> {
    const ws = ctx.ws;
    const permissions = this.permissionsOf(member);
    const path = "path" in action ? action.path : null;
    const tag = path !== null ? `<result action="${action.type}" path="${path}">` : `<result action="${action.type}">`;
    const text = (body: string) => ({ text: `${tag}${body}</result>` });
    const refuse = (reason: string) => text(`refused: ${reason}`);

    try {
      switch (action.type) {
        case "list":
          return text(`\n${ws.list(action.path)}\n`);
        case "read":
          return text(`\n${ws.read(action.path)}\n`);
        case "write":
        case "delete": {
          const needed: Permission = action.type === "write" ? "edit" : "delete";
          if (!permissions.has(needed)) return refuse(`you do not have the ${needed} permission.`);
          const { relative } = ws.resolvePath(action.path);
          if (!inScope(member.scope, relative)) return refuse(`${relative} is outside your scope (${member.scope.join(", ")}).`);
          const gate = action.type === "write" ? ({ kind: "write", path: relative } as const) : ({ kind: "delete", path: relative } as const);
          if (needsApproval(this.team.autonomy as Autonomy, gate)) {
            const kind: ApprovalKind = action.type === "write" ? "sensitive_file" : "delete";
            const human = await this.awaitApproval(member, kind, `${member.name} wants to ${action.type} ${relative}.`, { path: relative });
            if (!human.approved) return refuse(`the supervisor declined${human.note ? `: ${human.note}` : "."}`);
          }
          if (action.type === "write") ws.write(relative, action.content);
          else ws.delete(relative);
          this.log(member.id, "action", `${action.type === "write" ? "Edited" : "Deleted"} ${relative}`, { action: action.type, path: relative, worktree: ctx.worktree || undefined });
          return text("ok");
        }
        case "test": {
          if (!permissions.has("run_tests")) return refuse("you do not have the run_tests permission.");
          if (!this.team.testCommand) return refuse("this team has no test command configured.");
          if (!this.executor) return refuse("command execution is disabled on this server.");
          const result = await this.execCommand(member, this.team.testCommand, ws.root);
          return text(`\nexit code: ${result.exitCode ?? "timeout"}\n${result.output}\n`);
        }
        case "run": {
          if (!permissions.has("run_commands")) return refuse("you do not have the run_commands permission.");
          if (!this.executor) return refuse("command execution is disabled on this server.");
          if (needsApproval(this.team.autonomy as Autonomy, { kind: "command", command: action.command })) {
            const human = await this.awaitApproval(member, "command", `${member.name} wants to run: ${action.command}`, { command: action.command });
            if (!human.approved) return refuse(`the supervisor declined${human.note ? `: ${human.note}` : "."}`);
          }
          const result = await this.execCommand(member, action.command, ws.root);
          return text(`\nexit code: ${result.exitCode ?? "timeout"}\n${result.output}\n`);
        }
        case "browse":
        case "screenshot": {
          if (!permissions.has("browser")) return refuse("you do not have the browser permission.");
          const preview = getPreviewManager().get(this.team.id);
          if (preview.status !== "running" || !preview.port) return refuse("the preview is not running. Ask the supervisor to start it.");
          if (action.type === "browse") {
            const page = await browsePreview(preview.port, action.path);
            this.log(member.id, "action", `Viewed ${action.path} in the preview`, { action: "browse", path: action.path });
            return text(`\n${page}\n`);
          }
          const image = await screenshotPreview(preview.port, action.path);
          this.log(member.id, "action", `Took a screenshot of ${action.path}`, { action: "screenshot", path: action.path, image });
          return { text: `${tag}screenshot attached</result>`, image };
        }
        case "deploy": {
          if (!permissions.has("deploy")) return refuse("you do not have the deploy permission.");
          if (!this.team.deployCommand) return refuse("this team has no deploy command configured.");
          if (!this.executor) return refuse("command execution is disabled on this server.");
          const human = await this.awaitApproval(member, "deploy", `${member.name} wants to deploy: ${this.team.deployCommand}`, { command: this.team.deployCommand });
          if (!human.approved) return refuse(`the supervisor declined${human.note ? `: ${human.note}` : "."}`);
          const result = await this.execCommand(member, this.team.deployCommand, this.main.ws.root, { stage: "deploy" }, DEPLOY_TIMEOUT_MS);
          return text(`\nexit code: ${result.exitCode ?? "timeout"}\n${result.output}\n`);
        }
      }
    } catch (error) {
      if (error instanceof RunCancelled || error instanceof BudgetExhausted) throw error;
      return text(`error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async execCommand(member: CollabMemberRow | null, command: string, cwd: string, data: Record<string, unknown> = {}, timeoutMs?: number): Promise<CommandResult> {
    this.checkpoint();
    const result = await this.executor!.run(command, cwd, timeoutMs ? { timeoutMs } : {});
    this.log(member?.id ?? null, "command", result.output, { ...data, command, exit_code: result.exitCode, timed_out: result.timedOut, sandbox: this.executor!.kind });
    this.checkpoint();
    return result;
  }

  // --- human approval ----------------------------------------------------------

  /** Pauses until the supervisor approves or rejects, or the run is cancelled. Parallel steps can each be waiting at once. */
  private async awaitApproval(member: CollabMemberRow | null, kind: ApprovalKind, summary: string, payload: Record<string, unknown>): Promise<{ approved: boolean; note: string | null }> {
    const approval = this.repo.createApproval({ runId: this.run.id, userId: this.run.userId, memberId: member?.id ?? null, kind, summary, payload });
    if (member) this.status(member, "waiting", "is waiting for your approval.");
    this.log(member?.id ?? null, "approval", summary, { approval_id: approval.id, approval_kind: kind, status: "pending", ...payload });
    this.repo.updateRun(this.run.id, { status: "awaiting_approval" });

    for (;;) {
      this.checkpoint();
      const current = this.repo.getApproval(approval.id)!;
      if (current.status !== "pending") {
        if (this.repo.countPendingApprovals(this.run.id) === 0 && this.repo.getRun(this.run.id)?.status === "awaiting_approval") {
          this.repo.updateRun(this.run.id, { status: "running" });
        }
        const approved = current.status === "approved";
        this.log(null, "approval", `Supervisor ${approved ? "approved" : "rejected"}: ${summary}${current.note ? ` — ${current.note}` : ""}`, {
          approval_id: approval.id,
          approval_kind: kind,
          status: current.status,
        });
        if (member) this.status(member, "idle", "got an answer.");
        return { approved, note: current.note };
      }
      await new Promise((resolve) => setTimeout(resolve, this.approvalPollMs));
    }
  }

  // --- helpers -------------------------------------------------------------------

  private async call(member: CollabMemberRow, messages: ChatMessage[]): Promise<string> {
    this.checkpoint();
    if (this.calls >= this.team.maxModelCalls) {
      throw new BudgetExhausted(`Stopped: the run reached its limit of ${this.team.maxModelCalls} model calls. Raise the limit or narrow the task.`);
    }
    this.calls++;
    const reply = await this.client.complete(member.modelId, messages);
    this.checkpoint();
    return reply;
  }

  private checkpoint(): void {
    if (this.repo.getRun(this.run.id)?.status === "cancelling") throw new RunCancelled();
  }

  /** Reverts a step's uncommitted work: the tracked edits, and with git also anything commands left behind. */
  private async discard(ctx: StepContext | undefined): Promise<void> {
    if (!ctx) return;
    ctx.ws.revert();
    if (ctx.repo) {
      try {
        await ctx.repo.discardChanges();
      } catch {
        // the tracked revert above already restored the agents' own edits
      }
    }
  }

  private permissionsOf(member: CollabMemberRow): Set<Permission> {
    return effectivePermissions(member.role, member.permissions);
  }

  private toolOptions(): ToolOptions {
    const preview = getPreviewManager().get(this.team.id);
    return {
      testCommand: this.team.testCommand,
      commandsEnabled: this.executor !== null,
      previewRunning: preview.status === "running",
      screenshots: Boolean(getConfig().chromePath),
      deployCommand: this.team.deployCommand,
    };
  }

  private like(member: CollabMemberRow) {
    return { name: member.name, title: member.title, role: member.role, precedence: member.precedence, instructions: member.instructions, scope: member.scope, reportsTo: member.reportsTo };
  }

  private likeAll() {
    return this.members.map((member) => this.like(member));
  }

  private changedFiles(ctx: StepContext): string[] {
    return ctx.ws.changes().map((change) => change.path);
  }

  private diffOf(ctx: StepContext): string {
    const diff = ctx.ws.changes().map(unifiedDiff).join("\n\n");
    return diff.length > MAX_DIFF_CHARS ? `${diff.slice(0, MAX_DIFF_CHARS)}\n… (diff truncated)` : diff;
  }

  /** Before/after content of each changed file, for the side-by-side diff view; stops adding files past a size budget. */
  private filesDetail(ctx: StepContext): Array<{ path: string; before: string | null; after: string | null }> {
    let budget = MAX_DETAIL_CHARS;
    const detail: Array<{ path: string; before: string | null; after: string | null }> = [];
    for (const change of ctx.ws.changes()) {
      budget -= (change.before?.length ?? 0) + (change.after?.length ?? 0);
      if (budget < 0) break;
      detail.push(change);
    }
    return detail;
  }

  private status(member: CollabMemberRow, activity: AgentActivity, text: string, data: Record<string, unknown> = {}): void {
    this.log(member.id, "system", `${member.name} ${text}`, { ...data, activity });
  }

  private log(memberId: string | null, kind: CollabMessageKind, content: string, data: Record<string, unknown> = {}): void {
    this.repo.appendMessage({ runId: this.run.id, userId: this.run.userId, memberId, kind, content, data });
  }

  private finish(status: "completed" | "failed" | "cancelled", result: Record<string, unknown>, errorMessage: string | null): void {
    this.repo.updateRun(this.run.id, { status, result, errorMessage, completedAt: new Date().toISOString() });
    // Logged after the status change so live subscribers see the final status with it.
    this.log(null, "system", `Run ${status}.`, { status });
  }
}
