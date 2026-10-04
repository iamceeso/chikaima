import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

import { and, asc, desc, eq, gt, inArray } from "drizzle-orm";

import type { ChikaimaDatabase } from "../db/client.js";
import { collabApprovals, collabMembers, collabMessages, collabRuns, collabTasks, collabTeams } from "../db/schema.js";

export type CollabTeamRow = typeof collabTeams.$inferSelect;
export type CollabMemberRow = typeof collabMembers.$inferSelect;
export type CollabRunRow = typeof collabRuns.$inferSelect;
export type CollabMessageRow = typeof collabMessages.$inferSelect;
export type CollabApprovalRow = typeof collabApprovals.$inferSelect;
export type CollabTaskRow = typeof collabTasks.$inferSelect;

export type CollabRunStatus = "queued" | "running" | "awaiting_approval" | "cancelling" | "completed" | "failed" | "cancelled";
export type CollabMessageKind = "system" | "plan" | "message" | "action" | "command" | "change" | "review" | "decision" | "approval" | "summary" | "error";

export const ACTIVE_RUN_STATUSES: CollabRunStatus[] = ["queued", "running", "awaiting_approval", "cancelling"];

const MAX_REPLAY_MESSAGES = 1000;

/**
 * In-process fan-out of new run messages to live subscribers (the SSE
 * route). `collab_messages` is the durable record; this bus only saves
 * subscribers from polling for it.
 */
class CollabMessageBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  publish(message: CollabMessageRow): void {
    this.emitter.emit("message", message);
  }

  subscribe(runId: string, listener: (message: CollabMessageRow) => void): () => void {
    const handler = (message: CollabMessageRow) => {
      if (message.runId === runId) listener(message);
    };
    this.emitter.on("message", handler);
    return () => {
      this.emitter.off("message", handler);
    };
  }
}

/** Process-wide singleton, guarded against Next.js dev-mode module re-evaluation via globalThis. */
export function getCollabMessageBus(): CollabMessageBus {
  const globalKey = "__chikaimaCollabMessageBus__";
  const globalRef = globalThis as typeof globalThis & { [globalKey]?: CollabMessageBus };
  if (!globalRef[globalKey]) {
    globalRef[globalKey] = new CollabMessageBus();
  }
  return globalRef[globalKey]!;
}

export interface NewMember {
  modelId: string;
  name: string;
  title: string;
  role: string;
  instructions: string;
  precedence: number;
  scope: string[];
  permissions: string[];
  reportsTo: number | null;
  reviewedBy: number[];
}

export interface TeamSettings {
  name: string;
  folder: string;
  decisionPolicy: string;
  maxRevisions: number;
  autonomy: string;
  testCommand: string | null;
  maxModelCalls: number;
  gitEnabled: boolean;
  parallel: boolean;
  previewCommand: string | null;
  deployCommand: string | null;
  members: NewMember[];
}

export class CollabRepository {
  constructor(private readonly db: ChikaimaDatabase) {}

  createTeam(params: TeamSettings & { userId: string }): CollabTeamRow {
    const now = new Date().toISOString();
    const { members, ...settings } = params;
    const team: CollabTeamRow = { id: randomUUID(), ...settings, createdAt: now, updatedAt: now };
    this.db.transaction((tx) => {
      tx.insert(collabTeams).values(team).run();
      for (const member of members) {
        tx.insert(collabMembers)
          .values({ id: randomUUID(), teamId: team.id, ...member, createdAt: now, updatedAt: now })
          .run();
      }
    });
    return team;
  }

  /** Replaces a team's settings and its whole member list in one transaction. */
  updateTeam(teamId: string, params: TeamSettings): CollabTeamRow {
    const now = new Date().toISOString();
    const { members, ...settings } = params;
    this.db.transaction((tx) => {
      tx.update(collabTeams)
        .set({ ...settings, updatedAt: now })
        .where(eq(collabTeams.id, teamId))
        .run();
      tx.delete(collabMembers).where(eq(collabMembers.teamId, teamId)).run();
      for (const member of members) {
        tx.insert(collabMembers)
          .values({ id: randomUUID(), teamId, ...member, createdAt: now, updatedAt: now })
          .run();
      }
    });
    return this.getTeam(teamId)!;
  }

  deleteTeam(teamId: string): void {
    this.db.delete(collabTeams).where(eq(collabTeams.id, teamId)).run();
  }

  getTeam(teamId: string): CollabTeamRow | undefined {
    return this.db.select().from(collabTeams).where(eq(collabTeams.id, teamId)).get();
  }

  listTeams(userId: string): CollabTeamRow[] {
    return this.db.select().from(collabTeams).where(eq(collabTeams.userId, userId)).orderBy(desc(collabTeams.createdAt)).all();
  }

  /** Every team (from any user) working in this folder. */
  listTeamsByFolder(folder: string): CollabTeamRow[] {
    return this.db.select().from(collabTeams).where(eq(collabTeams.folder, folder)).all();
  }

  listMembers(teamId: string): CollabMemberRow[] {
    return this.db.select().from(collabMembers).where(eq(collabMembers.teamId, teamId)).orderBy(asc(collabMembers.precedence)).all();
  }

  createRun(params: { teamId: string; userId: string; task: string }): CollabRunRow {
    const now = new Date().toISOString();
    const run: CollabRunRow = {
      id: randomUUID(),
      teamId: params.teamId,
      userId: params.userId,
      task: params.task,
      status: "queued",
      result: {},
      errorMessage: null,
      baseBranch: null,
      runBranch: null,
      startedAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.db.insert(collabRuns).values(run).run();
    return run;
  }

  getRun(runId: string): CollabRunRow | undefined {
    return this.db.select().from(collabRuns).where(eq(collabRuns.id, runId)).get();
  }

  listRuns(teamId: string): CollabRunRow[] {
    return this.db.select().from(collabRuns).where(eq(collabRuns.teamId, teamId)).orderBy(desc(collabRuns.createdAt)).all();
  }

  /** Active runs on any of the given teams; used to keep two runs from editing the same folder at once. */
  listActiveRuns(teamIds: string[]): CollabRunRow[] {
    if (teamIds.length === 0) return [];
    return this.db
      .select()
      .from(collabRuns)
      .where(and(inArray(collabRuns.teamId, teamIds), inArray(collabRuns.status, ACTIVE_RUN_STATUSES)))
      .all();
  }

  /** Every active run, across all users. */
  listAllActiveRuns(): CollabRunRow[] {
    return this.db.select().from(collabRuns).where(inArray(collabRuns.status, ACTIVE_RUN_STATUSES)).all();
  }

  updateRun(
    runId: string,
    fields: Partial<Pick<CollabRunRow, "status" | "result" | "errorMessage" | "startedAt" | "completedAt" | "baseBranch" | "runBranch">>,
  ): void {
    this.db
      .update(collabRuns)
      .set({ ...fields, updatedAt: new Date().toISOString() })
      .where(eq(collabRuns.id, runId))
      .run();
  }

  /** Flags a queued or running run to stop at its next checkpoint. Returns false when the run had already finished. */
  requestCancel(runId: string): boolean {
    const updated = this.db
      .update(collabRuns)
      .set({ status: "cancelling", updatedAt: new Date().toISOString() })
      .where(and(eq(collabRuns.id, runId), inArray(collabRuns.status, ["queued", "running", "awaiting_approval"])))
      .returning()
      .all();
    return updated.length > 0;
  }

  appendMessage(params: {
    runId: string;
    userId: string;
    memberId?: string | null;
    kind: CollabMessageKind;
    content?: string;
    data?: Record<string, unknown>;
  }): CollabMessageRow {
    const row = this.db
      .insert(collabMessages)
      .values({
        runId: params.runId,
        userId: params.userId,
        memberId: params.memberId ?? null,
        kind: params.kind,
        content: params.content ?? "",
        data: params.data ?? {},
        createdAt: new Date().toISOString(),
      })
      .returning()
      .get();
    getCollabMessageBus().publish(row);
    return row;
  }

  listMessages(runId: string, afterId = 0): CollabMessageRow[] {
    return this.db
      .select()
      .from(collabMessages)
      .where(and(eq(collabMessages.runId, runId), gt(collabMessages.id, afterId)))
      .orderBy(asc(collabMessages.id))
      .limit(MAX_REPLAY_MESSAGES)
      .all();
  }

  createApproval(params: {
    runId: string;
    userId: string;
    memberId: string | null;
    kind: string;
    summary: string;
    payload?: Record<string, unknown>;
  }): CollabApprovalRow {
    const row: CollabApprovalRow = {
      id: randomUUID(),
      runId: params.runId,
      userId: params.userId,
      memberId: params.memberId,
      kind: params.kind,
      summary: params.summary,
      payload: params.payload ?? {},
      status: "pending",
      note: null,
      createdAt: new Date().toISOString(),
      resolvedAt: null,
    };
    this.db.insert(collabApprovals).values(row).run();
    return row;
  }

  getApproval(approvalId: string): CollabApprovalRow | undefined {
    return this.db.select().from(collabApprovals).where(eq(collabApprovals.id, approvalId)).get();
  }

  listApprovals(runId: string): CollabApprovalRow[] {
    return this.db.select().from(collabApprovals).where(eq(collabApprovals.runId, runId)).orderBy(asc(collabApprovals.createdAt)).all();
  }

  countPendingApprovals(runId: string): number {
    return this.db
      .select()
      .from(collabApprovals)
      .where(and(eq(collabApprovals.runId, runId), eq(collabApprovals.status, "pending")))
      .all().length;
  }

  /** Records the human's decision on a pending approval. Returns false if it was already decided. */
  resolveApproval(approvalId: string, status: "approved" | "rejected", note: string | null): boolean {
    const updated = this.db
      .update(collabApprovals)
      .set({ status, note, resolvedAt: new Date().toISOString() })
      .where(and(eq(collabApprovals.id, approvalId), eq(collabApprovals.status, "pending")))
      .returning()
      .all();
    return updated.length > 0;
  }

  // --- engineering tasks -------------------------------------------------------

  createTask(params: { teamId: string; userId: string; title: string; description: string; runId?: string | null }): CollabTaskRow {
    const now = new Date().toISOString();
    return this.db.transaction((tx) => {
      const last = tx
        .select({ number: collabTasks.number })
        .from(collabTasks)
        .where(eq(collabTasks.teamId, params.teamId))
        .orderBy(desc(collabTasks.number))
        .limit(1)
        .get();
      const row: CollabTaskRow = {
        id: randomUUID(),
        teamId: params.teamId,
        userId: params.userId,
        number: (last?.number ?? 0) + 1,
        title: params.title,
        description: params.description,
        runId: params.runId ?? null,
        createdAt: now,
        updatedAt: now,
      };
      tx.insert(collabTasks).values(row).run();
      return row;
    });
  }

  getTask(taskId: string): CollabTaskRow | undefined {
    return this.db.select().from(collabTasks).where(eq(collabTasks.id, taskId)).get();
  }

  listTasks(teamId: string, limit = 100): CollabTaskRow[] {
    return this.db.select().from(collabTasks).where(eq(collabTasks.teamId, teamId)).orderBy(desc(collabTasks.number)).limit(limit).all();
  }

  taskForRun(runId: string): CollabTaskRow | undefined {
    return this.db.select().from(collabTasks).where(eq(collabTasks.runId, runId)).get();
  }

  linkTaskRun(taskId: string, runId: string): void {
    this.db.update(collabTasks).set({ runId, updatedAt: new Date().toISOString() }).where(eq(collabTasks.id, taskId)).run();
  }

  deleteTask(taskId: string): void {
    this.db.delete(collabTasks).where(eq(collabTasks.id, taskId)).run();
  }
}
