import { randomUUID } from "node:crypto";

import { desc, eq, sql } from "drizzle-orm";

import type { ChikaimaDatabase } from "../db/client.js";
import { jobs } from "../db/schema.js";
import type { JobStatus, JobType } from "./types.js";

export type JobRow = typeof jobs.$inferSelect;

const DEFAULT_MAX_ATTEMPTS = 3;

export class JobRepository {
  constructor(private readonly db: ChikaimaDatabase) {}

  listForUser(userId: string): JobRow[] {
    return this.db.select().from(jobs).where(eq(jobs.userId, userId)).orderBy(desc(jobs.createdAt)).all();
  }

  get(id: string): JobRow | undefined {
    return this.db.select().from(jobs).where(eq(jobs.id, id)).get();
  }

  create(params: { userId: string; jobType: JobType; resourceType: string; resourceId: string; payload?: Record<string, unknown> }): JobRow {
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
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.db.insert(jobs).values(row).run();
    return row;
  }

  /** Atomically claims one queued job, if any, flipping it to `running`. */
  claimNextQueued(): JobRow | undefined {
    const now = new Date().toISOString();
    return this.db
      .update(jobs)
      .set({ status: "running", startedAt: now, attempts: sql`${jobs.attempts} + 1`, updatedAt: now })
      .where(sql`${jobs.id} = (SELECT id FROM jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1)`)
      .returning()
      .get();
  }

  markProgress(id: string, progress: number): void {
    this.db
      .update(jobs)
      .set({ progress, updatedAt: new Date().toISOString() })
      .where(eq(jobs.id, id))
      .run();
  }

  markCompleted(id: string, result: Record<string, unknown>): void {
    const now = new Date().toISOString();
    this.db.update(jobs).set({ status: "completed", progress: 100, result, completedAt: now, updatedAt: now }).where(eq(jobs.id, id)).run();
  }

  /** Marks a job failed. If it has attempts remaining, requeues it instead of leaving it terminally failed. */
  markFailedOrRetry(id: string, errorMessage: string): void {
    const job = this.get(id);
    if (!job) return;

    const now = new Date().toISOString();
    if (job.attempts < job.maxAttempts) {
      this.db.update(jobs).set({ status: "queued", errorMessage, updatedAt: now }).where(eq(jobs.id, id)).run();
    } else {
      this.db.update(jobs).set({ status: "failed", errorMessage, completedAt: now, updatedAt: now }).where(eq(jobs.id, id)).run();
    }
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
        this.db
          .update(jobs)
          .set({ status: "queued", errorMessage: "Interrupted by application restart; retrying.", updatedAt: now })
          .where(eq(jobs.id, job.id))
          .run();
        requeued += 1;
      } else {
        this.db
          .update(jobs)
          .set({ status: "failed", errorMessage: "Interrupted by application restart; no attempts remaining.", completedAt: now, updatedAt: now })
          .where(eq(jobs.id, job.id))
          .run();
        failed += 1;
      }
    }
    return { requeued, failed };
  }
}
