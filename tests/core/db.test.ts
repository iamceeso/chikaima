import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { __resetConfigForTests } from "../../core/config/index.js";
import { getDb, getRawConnection, __resetDbForTests } from "../../core/db/client.js";
import { users } from "../../core/db/schema.js";

async function withTempDb<T>(fn: () => T | Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "chikaima-db-test-"));
  const dbPath = join(dir, "test.db");
  const previous = process.env.CHIKAIMA_DB_PATH;
  process.env.CHIKAIMA_DB_PATH = dbPath;
  __resetConfigForTests();
  __resetDbForTests();
  try {
    return await fn();
  } finally {
    __resetDbForTests();
    __resetConfigForTests();
    if (previous === undefined) {
      delete process.env.CHIKAIMA_DB_PATH;
    } else {
      process.env.CHIKAIMA_DB_PATH = previous;
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

test("getDb applies all migrations and creates expected tables", async () => {
  await withTempDb(() => {
    const db = getDb();
    const tableNames = (
      getRawConnection().prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[]
    ).map((row) => row.name);

    for (const expected of ["users", "providers", "ai_models", "jobs", "asset_chunks", "workspace_configs"]) {
      assert.ok(tableNames.includes(expected), `expected table ${expected} to exist`);
    }

    db.insert(users)
      .values({
        id: "user-1",
        email: "person@example.com",
        fullName: "Person",
        hashedPassword: "hash",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .run();

    const row = db.select().from(users).all();
    assert.equal(row.length, 1);
    assert.equal(row[0]?.email, "person@example.com");
  });
});

test("sqlite-vec extension is loaded and the vector virtual table exists", async () => {
  await withTempDb(() => {
    getDb();
    const raw = getRawConnection();
    const version = raw.prepare("select vec_version() as v").get() as { v: string };
    assert.ok(version.v.startsWith("v"));

    raw.prepare("INSERT INTO asset_chunk_vectors(rowid, embedding) VALUES (?, ?)").run(1n, new Float32Array(384).fill(0.1));
    const match = raw
      .prepare("SELECT rowid, distance FROM asset_chunk_vectors WHERE embedding MATCH ? ORDER BY distance LIMIT 1")
      .get(new Float32Array(384).fill(0.1)) as { rowid: number; distance: number };
    assert.equal(match.rowid, 1);
    assert.ok(match.distance < 1e-6);
  });
});

test("repairCollabSchema adds collaboration columns and tables an early 0006 draft lacked, and is idempotent", async () => {
  const Database = (await import("better-sqlite3")).default;
  const { repairCollabSchema } = await import("../../core/db/client.js");
  const connection = new Database(":memory:");
  try {
    connection.exec(`
      CREATE TABLE users (id text PRIMARY KEY);
      CREATE TABLE collab_teams (id text PRIMARY KEY, user_id text, name text, folder text, decision_policy text, max_revisions integer, created_at text, updated_at text);
      CREATE TABLE collab_members (id text PRIMARY KEY, team_id text, model_id text, name text, role text, instructions text, precedence integer, created_at text, updated_at text);
      CREATE TABLE collab_runs (id text PRIMARY KEY);
      INSERT INTO collab_teams VALUES ('t', 'u', 'Team', 'site', 'majority', 2, 'x', 'x');
    `);
    repairCollabSchema(connection);
    repairCollabSchema(connection);
    const columns = (table: string) => (connection.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((row) => row.name);
    for (const column of ["autonomy", "test_command", "max_model_calls"]) assert.ok(columns("collab_teams").includes(column), column);
    for (const column of ["title", "scope", "permissions", "reports_to", "reviewed_by"]) assert.ok(columns("collab_members").includes(column), column);
    assert.ok(columns("collab_approvals").includes("resolved_at"));
    assert.deepEqual(connection.prepare("SELECT autonomy, max_model_calls FROM collab_teams").get(), { autonomy: "semi", max_model_calls: 80 });
  } finally {
    connection.close();
  }
});
