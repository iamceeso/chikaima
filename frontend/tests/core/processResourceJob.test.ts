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
import { documents, jobs, summaryArtifacts, transcripts } from "../../core/db/schema.js";
import { JobRepository } from "../../core/jobs/repository.js";
import { processResourceJob } from "../../core/jobs/processResource.js";
import { ProviderService } from "../../core/providers/providerService.js";

async function withTempDb<T>(fn: (workDir: string) => T | Promise<T>): Promise<T> {
  const dbDir = mkdtempSync(join(tmpdir(), "chikaima-process-db-"));
  const workDir = mkdtempSync(join(tmpdir(), "chikaima-process-work-"));
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

async function createOpenAiProvider(userId: string): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("unauthorized", { status: 401 })) as typeof fetch;
  try {
    await new ProviderService(getDb()).create(userId, { name: "My OpenAI", providerType: "openai", apiKey: "sk-test" });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

/** Mocks every provider-facing fetch call the pipeline makes: 4 chat completions (summary/key points/action items skipped for documents) + N embedding calls. */
function mockPipelineFetch(): typeof fetch {
  return (async (url: RequestInfo | URL) => {
    const href = String(url instanceof URL ? url.href : typeof url === "string" ? url : url.url);
    if (href.includes("/chat/completions")) {
      return new Response(JSON.stringify({ choices: [{ message: { content: "- point one\n- point two" } }] }), { status: 200 });
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

test("processResourceJob runs a document through extract -> transcript -> summary -> embed -> complete", async () => {
  await withTempDb(async (workDir) => {
    const db = getDb();
    const user = new AuthService(db).register({ email: "user@example.com", fullName: "User", password: "password123" });
    await createOpenAiProvider(user.id);

    const filePath = join(workDir, "notes.txt");
    writeFileSync(filePath, "This is a short document about quarterly planning.");

    const now = new Date().toISOString();
    const documentId = "doc-1";
    db.insert(documents)
      .values({ id: documentId, userId: user.id, name: "notes.txt", filePath, mimeType: "text/plain", status: "pending", createdAt: now, updatedAt: now })
      .run();

    const job = new JobRepository(db).create({ userId: user.id, jobType: "document_analysis", resourceType: "document", resourceId: documentId });

    const result = await withMockedFetch(mockPipelineFetch(), () => processResourceJob(db, job.id, "document_analysis"));

    assert.equal(result.status, "completed");

    const finishedJob = db.select().from(jobs).where(eq(jobs.id, job.id)).get()!;
    assert.equal(finishedJob.status, "completed");
    assert.equal(finishedJob.progress, 100);

    const updatedDoc = db.select().from(documents).where(eq(documents.id, documentId)).get()!;
    assert.equal(updatedDoc.status, "completed");
    assert.match(updatedDoc.summary ?? "", /point one|point two|quarterly/i);

    const transcript = db.select().from(transcripts).where(eq(transcripts.resourceId, documentId)).get()!;
    assert.match(transcript.content, /quarterly planning/);

    const summaries = db.select().from(summaryArtifacts).where(eq(summaryArtifacts.resourceId, documentId)).all();
    assert.equal(summaries.length, 2);
    assert.ok(summaries.some((s) => s.summaryType === "summary"));
    assert.ok(summaries.some((s) => s.summaryType === "key_points"));
  });
});

test("processResourceJob marks the job failed (not retried by itself) when the resource row is missing", async () => {
  await withTempDb(async () => {
    const db = getDb();
    const user = new AuthService(db).register({ email: "user@example.com", fullName: "User", password: "password123" });

    const job = new JobRepository(db).create({ userId: user.id, jobType: "document_analysis", resourceType: "document", resourceId: "does-not-exist" });

    const result = await processResourceJob(db, job.id, "document_analysis");
    assert.equal(result.status, "failed");

    const finishedJob = db.select().from(jobs).where(eq(jobs.id, job.id)).get()!;
    assert.equal(finishedJob.status, "failed");
    assert.match(finishedJob.errorMessage ?? "", /not found/i);
  });
});

test("processResourceJob throws (leaving retry decision to the caller) and marks the resource failed when extraction fails", async () => {
  await withTempDb(async (workDir) => {
    const db = getDb();
    const user = new AuthService(db).register({ email: "user@example.com", fullName: "User", password: "password123" });

    // No provider configured, so transcription throws "No supported transcription
    // provider is enabled" — a realistic extraction failure.
    const filePath = join(workDir, "clip.mp3");
    writeFileSync(filePath, "fake bytes");

    const now = new Date().toISOString();
    const { audioAssets } = await import("../../core/db/schema.js");
    db.insert(audioAssets).values({ id: "audio-1", userId: user.id, name: "clip.mp3", filePath, status: "pending", createdAt: now, updatedAt: now }).run();

    const repo = new JobRepository(db);
    const job = repo.create({ userId: user.id, jobType: "audio_transcription", resourceType: "audio", resourceId: "audio-1" });
    repo.claimNextQueued(); // simulate the worker having already claimed it, as real callers do

    await assert.rejects(() => processResourceJob(db, job.id, "audio_transcription"));

    const finishedJob = db.select().from(jobs).where(eq(jobs.id, job.id)).get()!;
    // processResourceJob itself does not set job status on the "extraction threw" path —
    // that's the JobWorker's job (see markFailedOrRetry) — so it should still read as
    // "running" here (the state claimNextQueued left it in), unchanged.
    assert.equal(finishedJob.status, "running");

    const updatedAudio = db.select().from(audioAssets).where(eq(audioAssets.id, "audio-1")).get()!;
    assert.equal(updatedAudio.status, "failed");
  });
});
