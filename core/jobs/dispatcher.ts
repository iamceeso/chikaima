import type { ChikaimaDatabase } from "../db/client.js";
import { badRequest } from "../errors.js";
import { JobRepository, type JobRow } from "./repository.js";
import { RESOURCE_TYPE_BY_JOB_TYPE, type JobType } from "./types.js";
import { getJobWorker } from "./worker.js";

export class JobDispatcher {
  private readonly jobs: JobRepository;

  constructor(private readonly db: ChikaimaDatabase) {
    this.jobs = new JobRepository(db);
  }

  listForUser(userId: string): JobRow[] {
    return this.jobs.listForUser(userId);
  }

  /**
   * Queues a job. `dependsOn` lists jobs (owned by the same user) that must
   * complete before this one is claimed; if any of them terminally fails,
   * this job is cancelled instead of run.
   */
  createJob(userId: string, jobType: JobType, resourceId: string, options: { dependsOn?: string[] } = {}): JobRow {
    const dependsOn = Array.from(new Set(options.dependsOn ?? []));
    const missing = this.jobs.findMissingForUser(userId, dependsOn);
    if (missing.length > 0) {
      throw badRequest(`Unknown upstream job(s): ${missing.join(", ")}`);
    }

    const job = this.jobs.create({ userId, jobType, resourceType: RESOURCE_TYPE_BY_JOB_TYPE[jobType], resourceId, dependsOn });
    // Nudge the worker immediately rather than waiting for the next poll tick.
    void getJobWorker(this.db).runOnce();
    return job;
  }
}
