import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";

import type { ChikaimaDatabase } from "../db/client.js";
import { jobEvents, jobs } from "../db/schema.js";
import { getJobEventBus, type JobEventRow, type JobEventType } from "./events.js";
import type { JobStatus, JobType } from "./types.js";

export type JobRow = typeof jobs.$inferSelect;

const DEFAULT_MAX_ATTEMPTS = 3;
const MAX_REPLAY_EVENTS = 500;

export class JobRepository {
  constructor(private readonly db: ChikaimaDatabase) {}

  listForUser(userId: string): JobRow[] {
    return this.db.select().from(jobs).where(eq(jobs.userId, userId)).orderBy(desc(jobs.createdAt)).all();
  }

  get(id: string): JobRow | undefined {
    return this.db.select().from(jobs).where(eq(jobs.id, id)).get();
  }

  create(params: {
    userId: string;
    jobType: JobType;
    resourceType: string;
    resourceId: string;
    payload?: Record<string, unknown>;
    dependsOn?: string[];
  }): JobRow {
    const now = new Date().toISOString();
    const row: JobRow = {
      id: randomUUID(),
      userId: params.userId,
      jobType: params.jobType,
      status: "queued",
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      payload: params.payload ?? {},
      result: {},
      progress: 0,
      attempts: 0,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      dependsOn: params.dependsOn ?? [],
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.db.insert(jobs).values(row).run();
    this.recordEvent(row, "queued", null, row.dependsOn.length > 0 ? { depends_on: row.dependsOn } : {});
    return row;
  }

  /**
   * Atomically claims the oldest queued job whose dependencies have all
   * completed, flipping it to `running`. A job depending on a missing or
   * not-yet-completed job is skipped, not claimed.
   */
  claimNextQueued(): JobRow | undefined {
    const now = new Date().toISOString();
    const claimed = this.db
      .update(jobs)
      .set({ status: "running", startedAt: now, attempts: sql`${jobs.attempts} + 1`, updatedAt: now })
      .where(
        sql`${jobs.id} = (
          SELECT j.id FROM jobs j
          WHERE j.status = 'queued'
            AND NOT EXISTS (
              SELECT 1 FROM json_each(j.depends_on) dep
              LEFT JOIN jobs upstream ON upstream.id = dep.value
              WHERE upstream.id IS NULL OR upstream.status != 'completed'
            )
          ORDER BY j.created_at ASC
          LIMIT 1
        )`,
      )
      .returning()
      .get();
    if (claimed) {
      this.recordEvent(claimed, "started", `Attempt ${claimed.attempts} of ${claimed.maxAttempts}`, { attempt: claimed.attempts });
    }
    return claimed;
  }

  /** Updates progress; when `stage` is given, also records a `stage` event so the pipeline's steps are visible in the job's history. */
  markProgress(id: string, progress: number, stage?: string): void {
    this.db.update(jobs).set({ progress, updatedAt: new Date().toISOString() }).where(eq(jobs.id, id)).run();
    if (stage) {
      const job = this.get(id);
      if (job) this.recordEvent(job, "stage", stage, { stage, progress });
    }
  }

  markCompleted(id: string, result: Record<string, unknown>): void {
    const now = new Date().toISOString();
    this.db.update(jobs).set({ status: "completed", progress: 100, result, errorMessage: null, completedAt: now, updatedAt: now }).where(eq(jobs.id, id)).run();
    const job = this.get(id);
    if (job) this.recordEvent(job, "completed", null, result);
  }

  /** Marks a job failed. If it has attempts remaining, requeues it instead of leaving it terminally failed. */
  markFailedOrRetry(id: string, errorMessage: string): void {
    const job = this.get(id);
    if (!job) return;

    if (job.attempts < job.maxAttempts) {
      this.db.update(jobs).set({ status: "queued", errorMessage, updatedAt: new Date().toISOString() }).where(eq(jobs.id, id)).run();
      this.recordEvent(job, "retry_scheduled", errorMessage, { attempt: job.attempts });
    } else {
      this.markFailed(id, errorMessage);
    }
  }

  /** Terminally fails a job (no retry), then cancels every queued job that transitively depends on it. */
  markFailed(id: string, errorMessage: string): void {
    const job = this.get(id);
    if (!job) return;

    const now = new Date().toISOString();
    this.db.update(jobs).set({ status: "failed", errorMessage, completedAt: now, updatedAt: now }).where(eq(jobs.id, id)).run();
    this.recordEvent(job, "failed", errorMessage, { attempt: job.attempts });
    this.cancelDependents(id);
  }

  setStatus(id: string, status: JobStatus): void {
    this.db.update(jobs).set({ status, updatedAt: new Date().toISOString() }).where(eq(jobs.id, id)).run();
  }

  /**
   * Recovers jobs left in `running` from a prior process that crashed or was
   * killed mid-job: requeue if attempts remain, otherwise mark failed — so
   * they don't sit invisibly "running" forever. Call once on startup, before
   * the worker begins claiming new work.
   */
  recoverStaleRunning(): { requeued: number; failed: number } {
    const stale = this.db.select().from(jobs).where(eq(jobs.status, "running")).all();
    let requeued = 0;
    let failed = 0;
    const now = new Date().toISOString();

    for (const job of stale) {
      if (job.attempts < job.maxAttempts) {
        const message = "Interrupted by application restart; retrying.";
        this.db.update(jobs).set({ status: "queued", errorMessage: message, updatedAt: now }).where(eq(jobs.id, job.id)).run();
        this.recordEvent(job, "recovered", message, { attempt: job.attempts });
        requeued += 1;
      } else {
        this.markFailed(job.id, "Interrupted by application restart; no attempts remaining.");
        failed += 1;
      }
    }
    return { requeued, failed };
  }

  listEvents(jobId: string): JobEventRow[] {
    return this.db.select().from(jobEvents).where(eq(jobEvents.jobId, jobId)).orderBy(asc(jobEvents.id)).all();
  }

  /** Events for a user newer than `afterId`, oldest first — used to replay what an SSE client missed while disconnected. */
  listEventsForUserAfter(userId: string, afterId: number): JobEventRow[] {
    return this.db
      .select()
      .from(jobEvents)
      .where(and(eq(jobEvents.userId, userId), gt(jobEvents.id, afterId)))
      .orderBy(asc(jobEvents.id))
      .limit(MAX_REPLAY_EVENTS)
      .all();
  }

  /** Returns which of `ids` are not jobs owned by `userId`. */
  findMissingForUser(userId: string, ids: string[]): string[] {
    if (ids.length === 0) return [];
    const found = new Set(
      this.db
        .select({ id: jobs.id })
        .from(jobs)
        .where(and(eq(jobs.userId, userId), inArray(jobs.id, ids)))
        .all()
        .map((row) => row.id),
    );
    return ids.filter((id) => !found.has(id));
  }

  private cancelDependents(failedJobId: string): void {
    const dependents = this.db
      .select()
      .from(jobs)
      .where(and(eq(jobs.status, "queued"), sql`EXISTS (SELECT 1 FROM json_each(${jobs.dependsOn}) WHERE value = ${failedJobId})`))
      .all();

    const now = new Date().toISOString();
    for (const dependent of dependents) {
      const message = `Cancelled: upstream job ${failedJobId} failed.`;
      this.db.update(jobs).set({ status: "failed", errorMessage: message, completedAt: now, updatedAt: now }).where(eq(jobs.id, dependent.id)).run();
      this.recordEvent(dependent, "cancelled", message, { upstream_job_id: failedJobId });
      this.cancelDependents(dependent.id);
    }
  }

  private recordEvent(job: Pick<JobRow, "id" | "userId">, eventType: JobEventType, message: string | null, data: Record<string, unknown>): void {
    const row = this.db
      .insert(jobEvents)
      .values({ jobId: job.id, userId: job.userId, eventType, message, data, createdAt: new Date().toISOString() })
      .returning()
      .get();
    getJobEventBus().publish(row);
  }
}
