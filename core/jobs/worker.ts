import type { ChikaimaDatabase } from "../db/client.js";
import { JobRepository } from "./repository.js";
import { processResourceJob } from "./processResource.js";
import type { JobType } from "./types.js";

const DEFAULT_POLL_INTERVAL_MS = 2_000;

/**
 * Polling-based local job executor, replacing Celery/Redis. Runs in-process
 * (this is a persistent `next start` Node process, not a serverless
 * function) and claims one queued job at a time via
 * `JobRepository.claimNextQueued()`'s atomic UPDATE...RETURNING, so it's
 * safe even if multiple worker instances end up running.
 */
export class JobWorker {
  private readonly jobs: JobRepository;
  private timer: ReturnType<typeof setInterval> | null = null;
  private processing = false;

  constructor(
    private readonly db: ChikaimaDatabase,
    private readonly pollIntervalMs: number = DEFAULT_POLL_INTERVAL_MS,
  ) {
    this.jobs = new JobRepository(db);
  }

  /** Requeues/fails jobs orphaned by a prior crash, then starts polling. Call once at process startup. */
  start(): void {
    if (this.timer) return;
    this.jobs.recoverStaleRunning();
    this.timer = setInterval(() => {
      void this.runOnce();
    }, this.pollIntervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Claims and processes at most one queued job. Returns whether a job was found. Safe to call directly (e.g. right after enqueuing, for lower latency than waiting on the poll interval). */
  async runOnce(): Promise<boolean> {
    if (this.processing) return false;
    this.processing = true;
    try {
      const job = this.jobs.claimNextQueued();
      if (!job) return false;

      try {
        await processResourceJob(this.db, job.id, job.jobType as JobType);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.jobs.markFailedOrRetry(job.id, message);
      }
      return true;
    } finally {
      this.processing = false;
    }
  }
}

/** Process-wide singleton, guarded against Next.js dev-mode module re-evaluation via globalThis. */
export function getJobWorker(db: ChikaimaDatabase): JobWorker {
  const globalKey = "__chikaimaJobWorker__";
  const globalRef = globalThis as typeof globalThis & { [globalKey]?: JobWorker };
  if (!globalRef[globalKey]) {
    const worker = new JobWorker(db);
    worker.start();
    globalRef[globalKey] = worker;
  }
  return globalRef[globalKey]!;
}
