import { eq } from "drizzle-orm";

import type { ChikaimaDatabase } from "../db/client.js";
import { users } from "../db/schema.js";

export type UserRow = typeof users.$inferSelect;

export class UserRepository {
  constructor(private readonly db: ChikaimaDatabase) {}

  get(id: string): UserRow | undefined {
    return this.db.select().from(users).where(eq(users.id, id)).get();
  }

  getByEmail(email: string): UserRow | undefined {
    return this.db.select().from(users).where(eq(users.email, email)).get();
  }

  count(): number {
    return this.db.select().from(users).all().length;
  }

  countSuperusers(): number {
    return this.db.select().from(users).all().filter((user) => user.isSuperuser).length;
  }

  listAll(): UserRow[] {
    return this.db.select().from(users).all().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  insert(user: UserRow): void {
    this.db.insert(users).values(user).run();
  }

  update(id: string, patch: Partial<Omit<UserRow, "id">>): UserRow {
    this.db
      .update(users)
      .set({ ...patch, updatedAt: new Date().toISOString() })
      .where(eq(users.id, id))
      .run();
    const updated = this.get(id);
    if (!updated) {
      throw new Error(`User ${id} disappeared during update`);
    }
    return updated;
  }

  delete(id: string): void {
    this.db.delete(users).where(eq(users.id, id)).run();
  }
}
