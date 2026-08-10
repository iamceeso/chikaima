import { eq } from "drizzle-orm";

import type { ChikaimaDatabase } from "../db/client.js";
import { aiModels, providers } from "../db/schema.js";

export type ProviderRow = typeof providers.$inferSelect;

export class ProviderRepository {
  constructor(private readonly db: ChikaimaDatabase) {}

  listForUser(userId: string): ProviderRow[] {
    return this.db.select().from(providers).where(eq(providers.userId, userId)).all();
  }

  get(id: string): ProviderRow | undefined {
    return this.db.select().from(providers).where(eq(providers.id, id)).get();
  }

  /** Mirrors the Python model's `models = relationship(..., cascade="all, delete-orphan")`. */
  delete(provider: ProviderRow): void {
    this.db.delete(aiModels).where(eq(aiModels.providerId, provider.id)).run();
    this.db.delete(providers).where(eq(providers.id, provider.id)).run();
  }
}
