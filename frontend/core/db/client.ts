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
  }
  return db;
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
