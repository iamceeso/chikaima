import type { ChikaimaDatabase } from "../db/client.js";
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

  createJob(userId: string, jobType: JobType, resourceId: string): JobRow {
    const job = this.jobs.create({ userId, jobType, resourceType: RESOURCE_TYPE_BY_JOB_TYPE[jobType], resourceId });
    // Nudge the worker immediately rather than waiting for the next poll tick.
    void getJobWorker(this.db).runOnce();
    return job;
  }
}
