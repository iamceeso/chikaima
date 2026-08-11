import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { eq } from "drizzle-orm";

import { AuthService } from "../../core/auth/authService.js";
import { __resetConfigForTests } from "../../core/config/index.js";
import { __resetSecretManagerForTests } from "../../core/crypto/index.js";
import { getDb, __resetDbForTests } from "../../core/db/client.js";
import { documents, jobs } from "../../core/db/schema.js";
import { JobDispatcher } from "../../core/jobs/dispatcher.js";
import { JobRepository } from "../../core/jobs/repository.js";
import { JobWorker } from "../../core/jobs/worker.js";
import { ProviderService } from "../../core/providers/providerService.js";

async function withTempDb<T>(fn: (workDir: string) => T | Promise<T>): Promise<T> {
  const dbDir = mkdtempSync(join(tmpdir(), "chikaima-worker-db-"));
  const workDir = mkdtempSync(join(tmpdir(), "chikaima-worker-work-"));
  const previous = process.env.CHIKAIMA_DB_PATH;
  process.env.CHIKAIMA_DB_PATH = join(dbDir, "test.db");
  __resetConfigForTests();
  __resetDbForTests();
  __resetSecretManagerForTests();
  try {
    return await fn(workDir);
  } finally {
    __resetDbForTests();
    __resetConfigForTests();
    __resetSecretManagerForTests();
    if (previous === undefined) delete process.env.CHIKAIMA_DB_PATH;
    else process.env.CHIKAIMA_DB_PATH = previous;
    rmSync(dbDir, { recursive: true, force: true });
    rmSync(workDir, { recursive: true, force: true });
  }
}

function mockPipelineFetch(): typeof fetch {
  return (async (url: RequestInfo | URL) => {
    const href = String(url instanceof URL ? url.href : typeof url === "string" ? url : url.url);
    if (href.includes("/chat/completions")) {
      return new Response(JSON.stringify({ choices: [{ message: { content: "- point" } }] }), { status: 200 });
    }
    if (href.includes("/embeddings")) {
      return new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }), { status: 200 });
    }
    throw new Error(`Unexpected fetch to ${href}`);
  }) as typeof fetch;
}

async function withMockedFetch<T>(handler: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

test("runOnce claims and fully processes exactly one queued job, returning false once none remain", async () => {
  await withTempDb(async (workDir) => {
    const db = getDb();
    const user = new AuthService(db).register({ email: "user@example.com", fullName: "User", password: "password123" });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("unauthorized", { status: 401 })) as typeof fetch;
    try {
      await new ProviderService(db).create(user.id, { name: "OpenAI", providerType: "openai", apiKey: "sk-test" });
    } finally {
      globalThis.fetch = originalFetch;
    }

    const filePath = join(workDir, "notes.txt");
    writeFileSync(filePath, "content for the worker to process");
    const now = new Date().toISOString();
    db.insert(documents).values({ id: "doc-1", userId: user.id, name: "notes.txt", filePath, mimeType: "text/plain", status: "pending", createdAt: now, updatedAt: now }).run();

    const repo = new JobRepository(db);
    const job = repo.create({ userId: user.id, jobType: "document_analysis", resourceType: "document", resourceId: "doc-1" });

    const worker = new JobWorker(db);
    const processed = await withMockedFetch(mockPipelineFetch(), () => worker.runOnce());
    assert.equal(processed, true);

    const finishedJob = db.select().from(jobs).where(eq(jobs.id, job.id)).get()!;
    assert.equal(finishedJob.status, "completed");

    const nothingLeft = await worker.runOnce();
    assert.equal(nothingLeft, false);
  });
});

test("runOnce requeues (does not terminally fail) a job on its first failure, since attempts remain", async () => {
  await withTempDb(async () => {
    const db = getDb();
    const user = new AuthService(db).register({ email: "user@example.com", fullName: "User", password: "password123" });
    // No document row exists for "missing-doc" -> processResourceJob's resource-not-found
    // path is a hard terminal failure (not a retry), so use a case that instead throws
    // mid-pipeline: a queued job pointing at a resource type that will fail extraction
    // because no provider is configured for the audio path.
    const repo = new JobRepository(db);
    const { audioAssets } = await import("../../core/db/schema.js");
    const now = new Date().toISOString();
    db.insert(audioAssets).values({ id: "audio-1", userId: user.id, name: "clip.mp3", filePath: "/nonexistent/clip.mp3", status: "pending", createdAt: now, updatedAt: now }).run();
    const job = repo.create({ userId: user.id, jobType: "audio_transcription", resourceType: "audio", resourceId: "audio-1" });

    const worker = new JobWorker(db);
    await worker.runOnce();

    const afterFirstFailure = repo.get(job.id)!;
    assert.equal(afterFirstFailure.status, "queued");
    assert.equal(afterFirstFailure.attempts, 1);
  });
});

test("start() recovers stale-running jobs left over from a previous process before polling", async () => {
  await withTempDb(async () => {
    const db = getDb();
    const user = new AuthService(db).register({ email: "user@example.com", fullName: "User", password: "password123" });
    const repo = new JobRepository(db);
    const job = repo.create({ userId: user.id, jobType: "document_analysis", resourceType: "document", resourceId: "doc-1" });
    repo.claimNextQueued(); // simulate a job left "running" by a process that crashed

    const worker = new JobWorker(db, 60_000);
    try {
      worker.start();
      const recovered = repo.get(job.id)!;
      assert.equal(recovered.status, "queued");
    } finally {
      worker.stop();
    }
  });
});

test("JobDispatcher.createJob enqueues a job and nudges the worker to process it promptly", async () => {
  await withTempDb(async (workDir) => {
    const db = getDb();
    const user = new AuthService(db).register({ email: "user@example.com", fullName: "User", password: "password123" });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("unauthorized", { status: 401 })) as typeof fetch;
    try {
      await new ProviderService(db).create(user.id, { name: "OpenAI", providerType: "openai", apiKey: "sk-test" });
    } finally {
      globalThis.fetch = originalFetch;
    }

    const filePath = join(workDir, "notes.txt");
    writeFileSync(filePath, "dispatcher pipeline content");
    const now = new Date().toISOString();
    db.insert(documents).values({ id: "doc-1", userId: user.id, name: "notes.txt", filePath, mimeType: "text/plain", status: "pending", createdAt: now, updatedAt: now }).run();

    const dispatcher = new JobDispatcher(db);
    const originalFetch2 = globalThis.fetch;
    globalThis.fetch = mockPipelineFetch();
    let created;
    try {
      created = dispatcher.createJob(user.id, "document_analysis", "doc-1");
      // createJob fires an unawaited worker.runOnce() nudge; give its microtasks/IO a turn.
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setTimeout(resolve, 50));
    } finally {
      globalThis.fetch = originalFetch2;
    }

    const finishedJob = db.select().from(jobs).where(eq(jobs.id, created.id)).get()!;
    assert.equal(finishedJob.status, "completed");
  });
});
