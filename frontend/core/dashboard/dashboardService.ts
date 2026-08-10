import { eq } from "drizzle-orm";

import type { ChikaimaDatabase } from "../db/client.js";
import { aiModels, documents, jobs, providers, videos } from "../db/schema.js";

export interface DashboardSummary {
  providers: number;
  models: number;
  documents: number;
  videos: number;
  jobs: number;
  system_health: string;
}

export class DashboardService {
  constructor(private readonly db: ChikaimaDatabase) {}

  getSummary(userId: string): DashboardSummary {
    const providerCount = this.db.select().from(providers).where(eq(providers.userId, userId)).all().length;
    const modelCount = this.db
      .select({ id: aiModels.id })
      .from(aiModels)
      .innerJoin(providers, eq(providers.id, aiModels.providerId))
      .where(eq(providers.userId, userId))
      .all().length;
    const documentCount = this.db.select().from(documents).where(eq(documents.userId, userId)).all().length;
    const videoCount = this.db.select().from(videos).where(eq(videos.userId, userId)).all().length;
    const jobCount = this.db.select().from(jobs).where(eq(jobs.userId, userId)).all().length;

    return {
      providers: providerCount,
      models: modelCount,
      documents: documentCount,
      videos: videoCount,
      jobs: jobCount,
      system_health: "healthy",
    };
  }
}
