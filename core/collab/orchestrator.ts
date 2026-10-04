import { getConfig } from "../config/index.js";
import type { ChikaimaDatabase } from "../db/client.js";
import { badRequest } from "../errors.js";
import { LLMService } from "../chat/llmService.js";
import type { ChatMessage } from "../providers/types.js";
import { effectivePermissions, inScope, needsApproval, type ApprovalKind, type Autonomy, type Permission } from "./capabilities.js";
import { runCommand, type CommandResult } from "./commands.js";
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
  type WorkspaceAction,
} from "./protocol.js";
import { CollabRepository, type CollabMemberRow, type CollabMessageKind, type CollabRunRow, type CollabTeamRow } from "./repository.js";
import { unifiedDiff, Workspace } from "./workspace.js";

/** Calls a model by its `ai_models` id. Injected so tests (and future transports) can stand in for real providers. */
export interface CollabModelClient {
  complete(modelId: string, messages: ChatMessage[]): Promise<string>;
}

const COLLAB_MAX_OUTPUT_TOKENS = 8192;
const MAX_AGENT_TURNS = 12;
const MAX_IDLE_TURNS = 2;
const MAX_DIFF_CHARS = 60_000;
const DEFAULT_APPROVAL_POLL_MS = 1_000;

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
export type AgentActivity = "planning" | "coding" | "reviewing" | "testing" | "waiting" | "summarizing";

interface StepOutcome {
  index: number;
  assignee: string;
  instruction: string;
  status: "approved" | "rejected" | "no_changes";
  revisions: number;
  files: string[];
  reason: string;
}

export interface OrchestratorOptions {
  /** How often a run waiting on a human re-checks the approval. */
  approvalPollMs?: number;
  /** Overrides CHIKAIMA_COLLAB_ALLOW_COMMANDS. */
  commandsEnabled?: boolean;
  runCommand?: (cwd: string, command: string) => Promise<CommandResult>;
}

/**
 * Drives one collaboration run end to end, as a supervised team:
 *
 *   lead plans → implementer edits (within its scope and permissions)
 *     → its assigned reviewers vote → testers write and run tests
 *     → the human approves (supervised autonomy) → kept, or reverted and
 *       sent back with feedback, at most `maxRevisions` times.
 *
 * Reviews follow explicit reporting lines rather than everyone reviewing
 * everyone, and every model call counts against the team's budget.
 */
export class CollabOrchestrator {
  private readonly repo: CollabRepository;
  private readonly approvalPollMs: number;
  private readonly commandsEnabled: boolean;
  private readonly runCommand: (cwd: string, command: string) => Promise<CommandResult>;

  private run!: CollabRunRow;
  private team!: CollabTeamRow;
  private members: CollabMemberRow[] = [];
  private workspace: Workspace | null = null;
  private calls = 0;

  constructor(
    db: ChikaimaDatabase,
    private readonly client: CollabModelClient,
    options: OrchestratorOptions = {},
  ) {
    this.repo = new CollabRepository(db);
    this.approvalPollMs = options.approvalPollMs ?? DEFAULT_APPROVAL_POLL_MS;
    this.commandsEnabled = options.commandsEnabled ?? getConfig().collabAllowCommands;
    this.runCommand = options.runCommand ?? runCommand;
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

    this.repo.updateRun(run.id, { status: "running", startedAt: new Date().toISOString() });
    this.log(null, "system", `Run started on "${this.team.folder}" with ${this.members.length} agent(s), ${this.team.autonomy} autonomy.`);

    try {
      this.workspace = Workspace.open(this.team.folder);
      const implementers = this.members.filter((member) => member.role === "implementer");
      if (implementers.length === 0) throw badRequest("The team needs at least one implementer.");
      const lead = this.members.find((member) => member.role === "lead") ?? null;

      const steps = await this.plan(lead, implementers);
      for (const [index, step] of steps.entries()) {
        const implementer = implementers.find((member) => member.precedence === step.assignee)!;
        outcomes.push(await this.runStep(implementer, step, index));
      }

      const summary = await this.summarize(lead, outcomes);
      this.finish("completed", { steps: outcomes, summary, model_calls: this.calls }, null);
    } catch (error) {
      this.workspace?.revert();
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

  // --- planning and steps ----------------------------------------------------

  private async plan(lead: CollabMemberRow | null, implementers: CollabMemberRow[]): Promise<PlanStep[]> {
    const fallback: PlanStep[] = [{ assignee: implementers[0]!.precedence, instruction: this.run.task }];
    if (!lead) {
      this.log(null, "plan", `No lead on this team; #${implementers[0]!.precedence} ${implementers[0]!.name} takes the whole task.`, { steps: fallback });
      return fallback;
    }

    this.status(lead, "planning", "is planning the work.");
    const reply = await this.call(lead, [{ role: "user", content: leadPlanPrompt(this.like(lead), this.members.map((m) => this.like(m)), this.run.task, this.workspace!.list()) }]);
    const valid = new Set(implementers.map((member) => member.precedence));
    const steps = parsePlan(reply).map((step) => (valid.has(step.assignee) ? step : { ...step, assignee: implementers[0]!.precedence }));
    const plan = steps.length > 0 ? steps : fallback;
    this.log(lead.id, "plan", steps.length > 0 ? reply : `${lead.name}'s plan could not be read; assigning the whole task to #${implementers[0]!.precedence}.`, { steps: plan });
    return plan;
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

  private async runStep(implementer: CollabMemberRow, step: PlanStep, index: number): Promise<StepOutcome> {
    const workspace = this.workspace!;
    const { reviewers, testers } = this.reviewersFor(implementer);
    const policy = this.team.decisionPolicy as DecisionPolicy;
    let feedback: string | null = null;

    for (let revision = 0; ; revision++) {
      const base = { index, assignee: implementer.name, instruction: step.instruction, revisions: revision };
      this.status(implementer, "coding", `is working on step ${index + 1}${revision > 0 ? ` (revision ${revision})` : ""}.`, { step: index, revision });
      const { note } = await this.agentLoop(implementer, "work", this.implementerSystem(implementer, step), feedback
        ? `Your previous attempt was rejected and has been reverted. Feedback:\n\n${feedback}\n\nRedo the step addressing it.`
        : "Begin the step.");

      if (workspace.changes().length === 0) {
        workspace.commit();
        this.log(null, "decision", `Step ${index + 1} made no changes.`, { step: index, approved: true, revision });
        return { ...base, status: "no_changes", files: [], reason: "No files changed." };
      }
      const diff = this.currentDiff();
      this.log(implementer.id, "change", diff, { step: index, revision, files: this.changedFiles() });

      // 1. Reviewers vote under the team's decision policy.
      const comments: string[] = [];
      const votes: Vote[] = [];
      for (const reviewer of reviewers) {
        this.status(reviewer, "reviewing", `is reviewing step ${index + 1}.`, { step: index });
        const verdict = await this.review(reviewer, implementer, step, note, diff);
        votes.push({ memberId: reviewer.id, precedence: reviewer.precedence, vote: verdict.vote });
        if (verdict.vote !== "approve" && verdict.comments) comments.push(`${reviewer.name} (#${reviewer.precedence}): ${verdict.comments}`);
        this.log(reviewer.id, "review", verdict.comments, { step: index, revision, vote: verdict.vote });
      }
      let decision = decide(policy, votes);

      // 2. Tests: tester agents (who may add tests), or the team's test command on its own.
      if (decision.approved) {
        const tested = await this.test(testers, implementer, step, note, index, revision);
        if (tested) {
          decision = tested;
          if (!tested.approved) comments.push(tested.reason);
        }
      }

      // 3. The human, when the team is supervised.
      if (decision.approved && needsApproval(this.team.autonomy as Autonomy, { kind: "step" })) {
        const human = await this.awaitApproval(implementer, "step", `Step ${index + 1} by ${implementer.name} is ready for your approval: ${step.instruction}`, {
          step: index,
          files: this.changedFiles(),
          diff: this.currentDiff(),
        });
        if (!human.approved) {
          decision = { approved: false, reason: `Rejected by the supervisor${human.note ? `: ${human.note}` : "."}` };
          comments.push(`Supervisor: ${human.note || "Rejected without a note; reconsider the approach."}`);
        }
      }

      const files = this.changedFiles();
      this.log(null, "decision", `Step ${index + 1} ${decision.approved ? "approved" : "rejected"}: ${decision.reason}`, { step: index, revision, approved: decision.approved, policy, files });
      if (decision.approved) {
        workspace.commit();
        return { ...base, status: "approved", files, reason: decision.reason };
      }
      workspace.revert();
      if (revision >= this.team.maxRevisions) {
        this.log(null, "system", `Step ${index + 1} abandoned after ${revision + 1} attempt(s); its changes were reverted.`, { step: index });
        return { ...base, status: "rejected", files, reason: decision.reason };
      }
      feedback = comments.length > 0 ? comments.join("\n\n") : decision.reason;
    }
  }

  private async review(reviewer: CollabMemberRow, author: CollabMemberRow, step: PlanStep, note: string | null, diff: string): Promise<ReviewVerdict> {
    const system = reviewerPrompt(
      this.like(reviewer),
      this.members.map((m) => this.like(m)),
      this.permissionsOf(reviewer),
      this.toolOptions(),
      this.run.task,
      step.instruction,
      this.like(author),
      note,
      diff,
    );
    const { verdict } = await this.agentLoop(reviewer, "review", system, "Review the change.");
    return verdict ?? { vote: null, comments: `${reviewer.name} did not return a verdict.` };
  }

  /** Runs the test stage. Returns null when there is nothing to test with, so the reviewers' decision stands. */
  private async test(testers: CollabMemberRow[], author: CollabMemberRow, step: PlanStep, note: string | null, index: number, revision: number): Promise<{ approved: boolean; reason: string } | null> {
    if (testers.length > 0) {
      for (const tester of testers) {
        this.status(tester, "testing", `is testing step ${index + 1}.`, { step: index });
        const verdict = await this.review(tester, author, step, note, this.currentDiff());
        this.log(tester.id, "review", verdict.comments, { step: index, revision, vote: verdict.vote, stage: "test" });
        if (verdict.vote !== "approve") {
          return { approved: false, reason: `${tester.name} (#${tester.precedence}) failed the change: ${verdict.comments || "no verdict."}` };
        }
      }
      return { approved: true, reason: `Reviewed and passed testing by ${testers.map((tester) => tester.name).join(", ")}.` };
    }
    if (!this.team.testCommand || !this.commandsEnabled) return null;

    const result = await this.execCommand(null, this.team.testCommand, { step: index, revision, stage: "test" });
    return result.exitCode === 0
      ? { approved: true, reason: `Approved by reviewers and \`${this.team.testCommand}\` passed.` }
      : { approved: false, reason: `\`${this.team.testCommand}\` failed (exit ${result.exitCode ?? "timeout"}):\n${result.output}` };
  }

  private async summarize(lead: CollabMemberRow | null, outcomes: StepOutcome[]): Promise<string> {
    const outcomeText = outcomes
      .map((outcome) => `Step ${outcome.index + 1} (${outcome.assignee}): ${outcome.status} after ${outcome.revisions + 1} attempt(s). ${outcome.reason}${outcome.files.length ? ` Files: ${outcome.files.join(", ")}` : ""}`)
      .join("\n");
    if (lead) this.status(lead, "summarizing", "is writing the report.");
    const summary = lead
      ? await this.call(lead, [{ role: "user", content: leadSummaryPrompt(this.like(lead), this.members.map((m) => this.like(m)), this.run.task, outcomeText) }])
      : outcomeText;
    this.log(lead?.id ?? null, "summary", summary);
    return summary;
  }

  // --- the agent loop ----------------------------------------------------------

  /**
   * One agent working through tag replies until it is finished: `<done/>` for
   * implementers, a `<verdict>` for reviewers and testers. Actions run
   * against the folder subject to the agent's permissions and scope.
   */
  private async agentLoop(member: CollabMemberRow, mode: "work" | "review", system: string, opening: string): Promise<{ note: string | null; verdict: ReviewVerdict | null }> {
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

      const results: string[] = [];
      for (const action of parsed.actions) results.push(await this.apply(member, action));
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
      messages.push({ role: "user", content: results.join("\n\n") });
    }
    return { note, verdict: null };
  }

  private async apply(member: CollabMemberRow, action: WorkspaceAction): Promise<string> {
    const workspace = this.workspace!;
    const permissions = this.permissionsOf(member);
    const tag = action.type === "run" ? `<result action="run">` : action.type === "test" ? `<result action="test">` : `<result action="${action.type}" path="${action.path}">`;
    const refuse = (reason: string) => `${tag}refused: ${reason}</result>`;

    try {
      switch (action.type) {
        case "list":
          return `${tag}\n${workspace.list(action.path)}\n</result>`;
        case "read":
          return `${tag}\n${workspace.read(action.path)}\n</result>`;
        case "write":
        case "delete": {
          const needed: Permission = action.type === "write" ? "edit" : "delete";
          if (!permissions.has(needed)) return refuse(`you do not have the ${needed} permission.`);
          const { relative } = workspace.resolvePath(action.path);
          if (!inScope(member.scope, relative)) return refuse(`${relative} is outside your scope (${member.scope.join(", ")}).`);
          const gate = action.type === "write" ? ({ kind: "write", path: relative } as const) : ({ kind: "delete", path: relative } as const);
          if (needsApproval(this.team.autonomy as Autonomy, gate)) {
            const kind: ApprovalKind = action.type === "write" ? "sensitive_file" : "delete";
            const human = await this.awaitApproval(member, kind, `${member.name} wants to ${action.type} ${relative}.`, { path: relative });
            if (!human.approved) return refuse(`the supervisor declined${human.note ? `: ${human.note}` : "."}`);
          }
          if (action.type === "write") workspace.write(relative, action.content);
          else workspace.delete(relative);
          this.log(member.id, "action", `${action.type === "write" ? "Edited" : "Deleted"} ${relative}`, { action: action.type, path: relative });
          return `${tag}ok</result>`;
        }
        case "test": {
          if (!permissions.has("run_tests")) return refuse("you do not have the run_tests permission.");
          if (!this.team.testCommand) return refuse("this team has no test command configured.");
          if (!this.commandsEnabled) return refuse("command execution is disabled on this server.");
          const result = await this.execCommand(member, this.team.testCommand);
          return `${tag}\nexit code: ${result.exitCode ?? "timeout"}\n${result.output}\n</result>`;
        }
        case "run": {
          if (!permissions.has("run_commands")) return refuse("you do not have the run_commands permission.");
          if (!this.commandsEnabled) return refuse("command execution is disabled on this server.");
          if (needsApproval(this.team.autonomy as Autonomy, { kind: "command", command: action.command })) {
            const human = await this.awaitApproval(member, "command", `${member.name} wants to run: ${action.command}`, { command: action.command });
            if (!human.approved) return refuse(`the supervisor declined${human.note ? `: ${human.note}` : "."}`);
          }
          const result = await this.execCommand(member, action.command);
          return `${tag}\nexit code: ${result.exitCode ?? "timeout"}\n${result.output}\n</result>`;
        }
      }
    } catch (error) {
      if (error instanceof RunCancelled || error instanceof BudgetExhausted) throw error;
      return `${tag}error: ${error instanceof Error ? error.message : String(error)}</result>`;
    }
  }

  private async execCommand(member: CollabMemberRow | null, command: string, data: Record<string, unknown> = {}): Promise<CommandResult> {
    this.checkpoint();
    const result = await this.runCommand(this.workspace!.root, command);
    this.log(member?.id ?? null, "command", result.output, { ...data, command, exit_code: result.exitCode, timed_out: result.timedOut });
    this.checkpoint();
    return result;
  }

  // --- human approval ----------------------------------------------------------

  /** Pauses the run until the supervisor approves or rejects, or the run is cancelled. */
  private async awaitApproval(member: CollabMemberRow, kind: ApprovalKind, summary: string, payload: Record<string, unknown>): Promise<{ approved: boolean; note: string | null }> {
    const approval = this.repo.createApproval({ runId: this.run.id, userId: this.run.userId, memberId: member.id, kind, summary, payload });
    this.status(member, "waiting", "is waiting for your approval.");
    this.log(member.id, "approval", summary, { approval_id: approval.id, approval_kind: kind, status: "pending", ...payload });
    this.repo.updateRun(this.run.id, { status: "awaiting_approval" });

    for (;;) {
      this.checkpoint();
      const current = this.repo.getApproval(approval.id)!;
      if (current.status !== "pending") {
        if (this.repo.getRun(this.run.id)?.status === "awaiting_approval") this.repo.updateRun(this.run.id, { status: "running" });
        const approved = current.status === "approved";
        this.log(null, "approval", `Supervisor ${approved ? "approved" : "rejected"}: ${summary}${current.note ? ` — ${current.note}` : ""}`, {
          approval_id: approval.id,
          approval_kind: kind,
          status: current.status,
        });
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

  private implementerSystem(member: CollabMemberRow, step: PlanStep): string {
    return implementerPrompt(this.like(member), this.members.map((m) => this.like(m)), this.permissionsOf(member), this.toolOptions(), this.run.task, step.instruction, this.workspace!.list());
  }

  private permissionsOf(member: CollabMemberRow): Set<Permission> {
    return effectivePermissions(member.role, member.permissions);
  }

  private toolOptions() {
    return { testCommand: this.team.testCommand, commandsEnabled: this.commandsEnabled };
  }

  private like(member: CollabMemberRow) {
    return { name: member.name, title: member.title, role: member.role, precedence: member.precedence, instructions: member.instructions, scope: member.scope, reportsTo: member.reportsTo };
  }

  private changedFiles(): string[] {
    return this.workspace!.changes().map((change) => change.path);
  }

  private currentDiff(): string {
    const diff = this.workspace!.changes().map(unifiedDiff).join("\n\n");
    return diff.length > MAX_DIFF_CHARS ? `${diff.slice(0, MAX_DIFF_CHARS)}\n… (diff truncated)` : diff;
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
