import { and, eq } from "drizzle-orm";

import type { ChikaimaDatabase } from "../db/client.js";
import { aiModels, providers } from "../db/schema.js";
import { badRequest, conflict, notFound } from "../errors.js";
import { AUTONOMY_LEVELS, PERMISSIONS, type Autonomy } from "./capabilities.js";
import { COLLAB_ROLES, DECISION_POLICIES, type CollabRole, type DecisionPolicy } from "./protocol.js";
import {
  CollabRepository,
  type CollabApprovalRow,
  type CollabMemberRow,
  type CollabMessageRow,
  type CollabRunRow,
  type CollabTeamRow,
  type NewMember,
  type TeamSettings,
} from "./repository.js";
import { getPreviewManager } from "./preview.js";
import { getCollabRunner } from "./runner.js";
import { disposeExecutor } from "./sandbox.js";
import { normalizeTeamFolder, Workspace } from "./workspace.js";

const MAX_MEMBERS = 8;
const MAX_TITLE_CHARS = 120;

/** A task's title: its first line, shortened. */
export function taskTitle(text: string): string {
  const first = text.trim().split("\n")[0]!.trim();
  return first.length > MAX_TITLE_CHARS ? `${first.slice(0, MAX_TITLE_CHARS - 1)}…` : first;
}
const MAX_REVISIONS = 5;
const MAX_MODEL_CALLS = 500;
const MAX_TASK_CHARS = 20_000;

export interface TeamMemberInput {
  model_id: string;
  name?: string;
  title?: string;
  role: string;
  instructions?: string;
  precedence: number;
  scope?: string[];
  permissions?: string[];
  reports_to?: number | null;
  reviewed_by?: number[];
}

export interface TeamInput {
  name: string;
  folder: string;
  decision_policy?: string;
  max_revisions?: number;
  autonomy?: string;
  test_command?: string | null;
  max_model_calls?: number;
  git_enabled?: boolean;
  parallel?: boolean;
  preview_command?: string | null;
  deploy_command?: string | null;
  members: TeamMemberInput[];
}

export interface TeamWithMembers {
  team: CollabTeamRow;
  members: CollabMemberRow[];
}

export class CollabService {
  private readonly repo: CollabRepository;

  constructor(private readonly db: ChikaimaDatabase) {
    this.repo = new CollabRepository(db);
  }

  listTeams(userId: string): TeamWithMembers[] {
    return this.repo.listTeams(userId).map((team) => ({ team, members: this.repo.listMembers(team.id) }));
  }

  getTeam(userId: string, teamId: string): TeamWithMembers {
    const team = this.repo.getTeam(teamId);
    if (!team || team.userId !== userId) throw notFound("Team not found.");
    return { team, members: this.repo.listMembers(team.id) };
  }

  createTeam(userId: string, input: TeamInput): TeamWithMembers {
    const team = this.repo.createTeam({ userId, ...this.validate(userId, input) });
    return { team, members: this.repo.listMembers(team.id) };
  }

  updateTeam(userId: string, teamId: string, input: TeamInput): TeamWithMembers {
    this.getTeam(userId, teamId);
    this.assertIdle(teamId, "Wait for the team's run to finish before changing it.");
    const team = this.repo.updateTeam(teamId, this.validate(userId, input));
    return { team, members: this.repo.listMembers(team.id) };
  }

  deleteTeam(userId: string, teamId: string): void {
    this.getTeam(userId, teamId);
    this.assertIdle(teamId, "Cancel the team's run before deleting it.");
    this.repo.deleteTeam(teamId);
    void getPreviewManager().stop(teamId);
    void disposeExecutor(teamId);
  }

  listRuns(userId: string, teamId: string): CollabRunRow[] {
    this.getTeam(userId, teamId);
    return this.repo.listRuns(teamId);
  }

  /**
   * Queues a run and starts it in the background. Only one run may edit a
   * given folder at a time, across all teams. Every run belongs to an
   * engineering task: pass `taskId` to start (or retry) a backlog task,
   * otherwise a task is created from the text.
   */
  startRun(userId: string, teamId: string, task: string, taskId?: string): CollabRunRow {
    const { team } = this.getTeam(userId, teamId);
    const trimmed = (task ?? "").trim();
    if (!trimmed) throw badRequest("Describe the task for the team.");
    if (trimmed.length > MAX_TASK_CHARS) throw badRequest(`Task is too long (over ${MAX_TASK_CHARS} characters).`);
    if (taskId) {
      const existing = this.repo.getTask(taskId);
      if (!existing || existing.teamId !== teamId) throw notFound("Task not found.");
    }
    if (this.folderBusy(team.folder)) throw conflict(`Another run is already working in "${team.folder}".`);

    const run = this.repo.createRun({ teamId, userId, task: trimmed });
    if (taskId) this.repo.linkTaskRun(taskId, run.id);
    else this.repo.createTask({ teamId, userId, title: taskTitle(trimmed), description: trimmed, runId: run.id });
    getCollabRunner(this.db).launch(run);
    return run;
  }

  getRun(userId: string, runId: string, afterMessageId = 0): { run: CollabRunRow; messages: CollabMessageRow[]; approvals: CollabApprovalRow[] } {
    const run = this.repo.getRun(runId);
    if (!run || run.userId !== userId) throw notFound("Run not found.");
    return { run, messages: this.repo.listMessages(runId, afterMessageId), approvals: this.repo.listApprovals(runId) };
  }

  cancelRun(userId: string, runId: string): CollabRunRow {
    const { run } = this.getRun(userId, runId);
    if (!this.repo.requestCancel(run.id)) throw conflict("This run has already finished.");
    return this.repo.getRun(run.id)!;
  }

  /** The supervisor's answer to an agent waiting for approval; the run picks it up and continues. */
  resolveApproval(userId: string, runId: string, approvalId: string, decision: string, note?: string | null): CollabApprovalRow {
    this.getRun(userId, runId);
    const approval = this.repo.getApproval(approvalId);
    if (!approval || approval.runId !== runId) throw notFound("Approval not found.");
    if (decision !== "approve" && decision !== "reject") throw badRequest('decision must be "approve" or "reject".');
    if (!this.repo.resolveApproval(approvalId, decision === "approve" ? "approved" : "rejected", (note ?? "").trim() || null)) {
      throw conflict("This approval has already been decided.");
    }
    return this.repo.getApproval(approvalId)!;
  }

  // --- the team folder, for the workspace view ----------------------------------

  listFiles(userId: string, teamId: string): { entries: Array<{ path: string; type: "file" | "dir" }>; truncated: boolean } {
    const { team } = this.getTeam(userId, teamId);
    return Workspace.open(team.folder).entries();
  }

  readFile(userId: string, teamId: string, path: string): { path: string; content: string } {
    const { team } = this.getTeam(userId, teamId);
    const workspace = Workspace.open(team.folder);
    return { path: workspace.resolvePath(path).relative, content: workspace.read(path) };
  }

  /** A human edit. Refused while a run is working in the folder, so it can't be tangled up in (or reverted with) an agent's step. */
  writeFile(userId: string, teamId: string, path: string, content: string): { path: string } {
    const { team } = this.getTeam(userId, teamId);
    if (typeof content !== "string") throw badRequest("content must be a string.");
    if (this.folderBusy(team.folder)) throw conflict("Agents are working in this folder; wait for the run to finish or stop it first.");
    const workspace = Workspace.open(team.folder);
    const { relative } = workspace.resolvePath(path);
    workspace.write(relative, content);
    workspace.commit();
    return { path: relative };
  }

  /** Whether a run is active in this folder (from any team). */
  isFolderBusy(folder: string): boolean {
    return this.folderBusy(folder);
  }

  private folderBusy(folder: string): boolean {
    return this.repo.listAllActiveRuns().some((run) => this.repo.getTeam(run.teamId)?.folder === folder);
  }

  private assertIdle(teamId: string, message: string): void {
    if (this.repo.listActiveRuns([teamId]).length > 0) throw conflict(message);
  }

  private validate(userId: string, input: TeamInput): TeamSettings {
    const name = (input?.name ?? "").trim();
    if (!name) throw badRequest("Team name is required.");
    const folder = normalizeTeamFolder(input.folder ?? "");

    const decisionPolicy = (input.decision_policy ?? "majority") as DecisionPolicy;
    if (!DECISION_POLICIES.includes(decisionPolicy)) {
      throw badRequest(`decision_policy must be one of: ${DECISION_POLICIES.join(", ")}.`);
    }
    const autonomy = (input.autonomy ?? "semi") as Autonomy;
    if (!AUTONOMY_LEVELS.includes(autonomy)) throw badRequest(`autonomy must be one of: ${AUTONOMY_LEVELS.join(", ")}.`);

    const maxRevisions = input.max_revisions ?? 2;
    if (!Number.isInteger(maxRevisions) || maxRevisions < 0 || maxRevisions > MAX_REVISIONS) {
      throw badRequest(`max_revisions must be a whole number from 0 to ${MAX_REVISIONS}.`);
    }
    const maxModelCalls = input.max_model_calls ?? 80;
    if (!Number.isInteger(maxModelCalls) || maxModelCalls < 1 || maxModelCalls > MAX_MODEL_CALLS) {
      throw badRequest(`max_model_calls must be a whole number from 1 to ${MAX_MODEL_CALLS}.`);
    }
    const testCommand = (input.test_command ?? "").trim() || null;
    const previewCommand = (input.preview_command ?? "").trim() || null;
    const deployCommand = (input.deploy_command ?? "").trim() || null;
    const gitEnabled = input.git_enabled ?? true;
    const parallel = input.parallel ?? false;
    if (parallel && !gitEnabled) throw badRequest("Parallel work needs git: each agent works in its own git worktree.");

    const rawMembers = Array.isArray(input.members) ? input.members : [];
    if (rawMembers.length === 0 || rawMembers.length > MAX_MEMBERS) {
      throw badRequest(`A team needs between 1 and ${MAX_MEMBERS} members.`);
    }
    const ranks = new Set<number>();
    for (const member of rawMembers) {
      if (!Number.isInteger(member.precedence) || member.precedence < 1) throw badRequest("Member precedence must be a whole number of 1 or more.");
      if (ranks.has(member.precedence)) throw badRequest(`Two members share precedence #${member.precedence}; each rank must be unique.`);
      ranks.add(member.precedence);
    }

    const members = rawMembers.map((member): NewMember => {
      const role = member.role as CollabRole;
      if (!COLLAB_ROLES.includes(role)) throw badRequest(`Member role must be one of: ${COLLAB_ROLES.join(", ")}.`);

      const permissions = Array.from(new Set(member.permissions ?? []));
      const unknown = permissions.filter((permission) => !(PERMISSIONS as readonly string[]).includes(permission));
      if (unknown.length > 0) throw badRequest(`Unknown permission(s): ${unknown.join(", ")}. Use: ${PERMISSIONS.join(", ")}.`);

      const scope = (member.scope ?? []).map((entry) => String(entry).trim()).filter(Boolean);
      for (const entry of scope) {
        if (entry.startsWith("/") || entry.split("/").includes("..")) throw badRequest(`Scope "${entry}" must be a path inside the team folder.`);
      }

      const reportsTo = member.reports_to ?? null;
      if (reportsTo !== null && (reportsTo === member.precedence || !ranks.has(reportsTo))) {
        throw badRequest(`#${member.precedence} reports to #${reportsTo}, which is not another member of the team.`);
      }
      const reviewedBy = Array.from(new Set(member.reviewed_by ?? []));
      for (const rank of reviewedBy) {
        if (rank === member.precedence || !ranks.has(rank)) throw badRequest(`#${member.precedence} is reviewed by #${rank}, which is not another member of the team.`);
      }

      const model = this.db
        .select({ id: aiModels.id, displayName: aiModels.displayName })
        .from(aiModels)
        .innerJoin(providers, eq(providers.id, aiModels.providerId))
        .where(and(eq(aiModels.id, member.model_id), eq(providers.userId, userId), eq(providers.isEnabled, true), eq(aiModels.isAvailable, true)))
        .get();
      if (!model) throw badRequest(`Model ${member.model_id} is not an enabled model on one of your providers.`);

      return {
        modelId: model.id,
        name: (member.name ?? "").trim() || (member.title ?? "").trim() || model.displayName,
        title: (member.title ?? "").trim(),
        role,
        instructions: (member.instructions ?? "").trim(),
        precedence: member.precedence,
        scope,
        permissions,
        reportsTo,
        reviewedBy,
      };
    });

    if (!members.some((member) => member.role === "implementer")) throw badRequest("A team needs at least one implementer.");
    if (members.filter((member) => member.role === "lead").length > 1) throw badRequest("A team can have at most one lead.");
    return { name, folder, decisionPolicy, maxRevisions, autonomy, testCommand, maxModelCalls, gitEnabled, parallel, previewCommand, deployCommand, members };
  }
}
