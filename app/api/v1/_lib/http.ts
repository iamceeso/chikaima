import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAdminUser, getCurrentUser } from "@/core/auth/deps.js";
import type { UserRow } from "@/core/auth/repository.js";
import { getDb, type ChikaimaDatabase } from "@/core/db/client.js";
import { HttpError, badRequest } from "@/core/errors.js";
import { getJobWorker } from "@/core/jobs/worker.js";

/**
 * `instrumentation.ts`'s `register()` would be the conventional place to
 * start the job worker on server boot, but Next also compiles that file for
 * the edge runtime (even though it never runs there, per the NEXT_RUNTIME
 * guard it'd need) — and that edge compilation pass can't bundle native
 * addons like better-sqlite3, so it hard-fails the whole server before any
 * request can be served. Starting the worker as a side effect of this
 * module — imported by every Route Handler, only ever loaded through the
 * normal Node server bundle — reaches the same outcome (worker running,
 * `recoverStaleRunning()` called before anything is claimed) as soon as the
 * first request comes in, which for a running frontend is effectively
 * server start. `getJobWorker` is itself idempotent (globalThis-guarded).
 */
let workerStarted = false;

export function db(): ChikaimaDatabase {
  const database = getDb();
  if (!workerStarted) {
    workerStarted = true;
    getJobWorker(database);
  }
  return database;
}

function authorizationHeader(request: NextRequest): string | null {
  return request.headers.get("authorization");
}

export function requireUser(request: NextRequest, database: ChikaimaDatabase): Promise<UserRow> {
  return getCurrentUser(database, authorizationHeader(request));
}

export function requireAdminUser(request: NextRequest, database: ChikaimaDatabase): Promise<UserRow> {
  return getCurrentAdminUser(database, authorizationHeader(request));
}

export async function readJson<T>(request: NextRequest): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw badRequest("Request body must be valid JSON.");
  }
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

/**
 * Runs a route body and translates a thrown HttpError into its matching
 * JSON error response — the Route Handler equivalent of FastAPI's automatic
 * HTTPException -> JSON conversion.
 */
export async function handleRoute(body: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await body();
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ detail: error.detail }, { status: error.statusCode });
    }
    console.error(error);
    return NextResponse.json({ detail: "Internal server error" }, { status: 500 });
  }
}
