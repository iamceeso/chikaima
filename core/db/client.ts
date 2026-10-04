import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as sqliteVec from "sqlite-vec";

import { getConfig } from "../config/index.js";
import * as schema from "./schema.js";

export type ChikaimaDatabase = BetterSQLite3Database<typeof schema>;

export const EMBEDDING_VECTOR_TABLE = "asset_chunk_vectors";

let sqlite: Database.Database | null = null;
let db: ChikaimaDatabase | null = null;

function openConnection(): Database.Database {
  const config = getConfig();
  const path = config.dbPath === ":memory:" ? ":memory:" : resolve(config.dbPath);

  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

  const connection = new Database(path);
  connection.pragma("journal_mode = WAL");
  connection.pragma("foreign_keys = ON");
  sqliteVec.load(connection);
  return connection;
}

/**
 * Lazily opens the single shared SQLite connection for the process, applies
 * any pending migrations, and returns the Drizzle handle. Mirrors the
 * lru_cache'd engine/session-factory singleton in the Python backend's
 * core/database.py.
 */
export function getDb(): ChikaimaDatabase {
  if (!db) {
    sqlite = openConnection();
    db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: resolve(process.cwd(), "core/db/migrations") });
    repairCollabSchema(sqlite);
  }
  return db;
}

/**
 * Columns that an early development draft of migration 0006 didn't create.
 * A database that applied that draft is recorded as being past 0006, so the
 * migrator never adds them; this fills the gap idempotently on startup.
 */
const COLLAB_COLUMNS: Array<[table: string, column: string, ddl: string]> = [
  ["collab_teams", "autonomy", "text DEFAULT 'semi' NOT NULL"],
  ["collab_teams", "test_command", "text"],
  ["collab_teams", "max_model_calls", "integer DEFAULT 80 NOT NULL"],
  ["collab_members", "title", "text DEFAULT '' NOT NULL"],
  ["collab_members", "scope", "text DEFAULT '[]' NOT NULL"],
  ["collab_members", "permissions", "text DEFAULT '[]' NOT NULL"],
  ["collab_members", "reports_to", "integer"],
  ["collab_members", "reviewed_by", "text DEFAULT '[]' NOT NULL"],
];

export function repairCollabSchema(connection: Database.Database): void {
  const columnsOf = (table: string) => new Set((connection.prepare(`PRAGMA table_info(\`${table}\`)`).all() as Array<{ name: string }>).map((row) => row.name));
  const existing = new Map<string, Set<string>>();
  for (const [table, column, ddl] of COLLAB_COLUMNS) {
    if (!existing.has(table)) existing.set(table, columnsOf(table));
    const columns = existing.get(table)!;
    // Skip tables that don't exist at all (columns is empty): the migrations own their creation.
    if (columns.size > 0 && !columns.has(column)) {
      connection.exec(`ALTER TABLE \`${table}\` ADD \`${column}\` ${ddl}`);
      columns.add(column);
    }
  }
  if (existing.get("collab_teams")?.size) {
    connection.exec(`CREATE TABLE IF NOT EXISTS \`collab_approvals\` (
      \`id\` text PRIMARY KEY NOT NULL,
      \`run_id\` text NOT NULL,
      \`user_id\` text NOT NULL,
      \`member_id\` text,
      \`kind\` text NOT NULL,
      \`summary\` text NOT NULL,
      \`payload\` text DEFAULT '{}' NOT NULL,
      \`status\` text DEFAULT 'pending' NOT NULL,
      \`note\` text,
      \`created_at\` text NOT NULL,
      \`resolved_at\` text,
      FOREIGN KEY (\`run_id\`) REFERENCES \`collab_runs\`(\`id\`) ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE no action
    );
    CREATE INDEX IF NOT EXISTS \`idx_collab_approvals_run_id\` ON \`collab_approvals\` (\`run_id\`, \`status\`);`);
  }
}

/** Raw better-sqlite3 handle, for operations Drizzle's query builder doesn't cover (vec0 virtual table access). */
export function getRawConnection(): Database.Database {
  getDb();
  if (!sqlite) {
    throw new Error("SQLite connection was not initialized.");
  }
  return sqlite;
}

/** Test-only: force a fresh connection (and re-run migrations) on next getDb() call. */
export function __resetDbForTests(): void {
  sqlite?.close();
  sqlite = null;
  db = null;
}
