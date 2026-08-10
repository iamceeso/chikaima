import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { eq } from "drizzle-orm";

import { AssetService } from "../../core/assets/assetService.js";
import { AuthService } from "../../core/auth/authService.js";
import { __resetConfigForTests } from "../../core/config/index.js";
import { __resetSecretManagerForTests } from "../../core/crypto/index.js";
import { getDb, __resetDbForTests } from "../../core/db/client.js";
import { documents, jobs, summaryArtifacts, transcripts } from "../../core/db/schema.js";
import { EmbeddingsService } from "../../core/embeddings/embeddingsService.js";
import { HttpError } from "../../core/errors.js";
import { JobRepository } from "../../core/jobs/repository.js";
import { ProviderService } from "../../core/providers/providerService.js";
import { AssetSearchService } from "../../core/rag/assetSearchService.js";

async function withTempDb<T>(fn: (workDir: string) => T | Promise<T>): Promise<T> {
  const dbDir = mkdtempSync(join(tmpdir(), "chikaima-assets-db-"));
  const workDir = mkdtempSync(join(tmpdir(), "chikaima-assets-work-"));
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

function seedDocument(userId: string, filePath: string, id = "doc-1") {
  const now = new Date().toISOString();
  getDb()
    .insert(documents)
    .values({ id, userId, name: "notes.txt", filePath, mimeType: "text/plain", status: "completed", summary: null, createdAt: now, updatedAt: now })
    .run();
  return id;
}

function seedTranscript(userId: string, resourceId: string, content: string) {
  const now = new Date().toISOString();
  getDb()
    .insert(transcripts)
    .values({ id: "transcript-1", userId, resourceType: "document", resourceId, language: "en", content, segments: [], status: "completed", createdAt: now, updatedAt: now })
    .run();
}

async function createOpenAiProvider(userId: string): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("unauthorized", { status: 401 })) as typeof fetch;
  try {
    await new ProviderService(getDb()).create(userId, { name: "OpenAI", providerType: "openai", apiKey: "sk-test" });
  } finally {
    globalThis.fetch = originalFetch;
  }
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

test("getResource enforces ownership: another user's resource looks not-found", async () => {
  await withTempDb(async (workDir) => {
    const db = getDb();
    const owner = new AuthService(db).register({ email: "owner@example.com", fullName: "Owner", password: "password123" });
    const other = new AuthService(db).register({ email: "other@example.com", fullName: "Other", password: "password123" });
    const docId = seedDocument(owner.id, join(workDir, "notes.txt"));

    const service = new AssetService(db);
    assert.doesNotThrow(() => service.getResource(owner.id, "document", docId));
    assert.throws(() => service.getResource(other.id, "document", docId), (e: unknown) => e instanceof HttpError && e.statusCode === 404);
  });
});

test("deleteResource removes the file, vector chunks, jobs, transcript, summaries, and the resource row", async () => {
  await withTempDb(async (workDir) => {
    const db = getDb();
    const user = new AuthService(db).register({ email: "user@example.com", fullName: "User", password: "password123" });
    await createOpenAiProvider(user.id);

    const filePath = join(workDir, "notes.txt");
    writeFileSync(filePath, "hello world");
    const docId = seedDocument(user.id, filePath);
    seedTranscript(user.id, docId, "hello world transcript");
    new JobRepository(db).create({ userId: user.id, jobType: "document_analysis", resourceType: "document", resourceId: docId });

    await withMockedFetch(
      (async () => new Response(JSON.stringify({ data: [{ embedding: [1, 0, 0] }] }), { status: 200 })) as typeof fetch,
      () => new EmbeddingsService(db).replaceChunksForSource({ userId: user.id, sourceType: "document", sourceId: docId, assetType: "document", filename: "notes.txt", chunks: [{ content: "chunk", metadata: {} }] }),
    );

    new AssetService(db).deleteResource(user.id, "document", docId);

    assert.equal(existsSync(filePath), false);
    assert.equal(db.select().from(documents).where(eq(documents.id, docId)).get(), undefined);
    assert.equal(db.select().from(transcripts).where(eq(transcripts.resourceId, docId)).get(), undefined);
    assert.equal(db.select().from(jobs).where(eq(jobs.resourceId, docId)).get(), undefined);

    const searchResults = await withMockedFetch(
      (async () => new Response(JSON.stringify({ data: [{ embedding: [1, 0, 0] }] }), { status: 200 })) as typeof fetch,
      () => new AssetSearchService(db).search(user.id, "anything"),
    );
    assert.deepEqual(searchResults, []);
  });
});

test("deleteAllResources deletes every document owned by the user and returns the count", async () => {
  await withTempDb(async (workDir) => {
    const db = getDb();
    const user = new AuthService(db).register({ email: "user@example.com", fullName: "User", password: "password123" });
    seedDocument(user.id, join(workDir, "a.txt"), "doc-a");
    seedDocument(user.id, join(workDir, "b.txt"), "doc-b");

    const removed = new AssetService(db).deleteAllResources(user.id, "document");
    assert.equal(removed, 2);
    assert.equal(db.select().from(documents).all().length, 0);
  });
});

test("summarizeResource creates summary + key_points artifacts, then updates them in place on a second call", async () => {
  await withTempDb(async (workDir) => {
    const db = getDb();
    const user = new AuthService(db).register({ email: "user@example.com", fullName: "User", password: "password123" });
    await createOpenAiProvider(user.id);
    const docId = seedDocument(user.id, join(workDir, "notes.txt"));
    seedTranscript(user.id, docId, "quarterly planning notes");

    const mockFetch = (async () => new Response(JSON.stringify({ choices: [{ message: { content: "- alpha\n- beta" } }] }), { status: 200 })) as typeof fetch;

    const first = await withMockedFetch(mockFetch, () => new AssetService(db).summarizeResource(user.id, "document", docId));
    assert.equal(first.length, 2);
    const firstSummaryId = first.find((s) => s.summaryType === "summary")!.id;

    const second = await withMockedFetch(mockFetch, () => new AssetService(db).summarizeResource(user.id, "document", docId));
    assert.equal(second.length, 2);
    assert.equal(second.find((s) => s.summaryType === "summary")!.id, firstSummaryId);

    const updatedDoc = db.select().from(documents).where(eq(documents.id, docId)).get()!;
    assert.match(updatedDoc.summary ?? "", /alpha|beta/);
  });
});

test("queryTranscript rejects a transcript owned by a different user", async () => {
  await withTempDb(async (workDir) => {
    const db = getDb();
    const owner = new AuthService(db).register({ email: "owner@example.com", fullName: "Owner", password: "password123" });
    const other = new AuthService(db).register({ email: "other@example.com", fullName: "Other", password: "password123" });
    const docId = seedDocument(owner.id, join(workDir, "notes.txt"));
    seedTranscript(owner.id, docId, "content");

    await assert.rejects(
      () => new AssetService(db).queryTranscript(other.id, "transcript-1", "what is this about?"),
      (e: unknown) => e instanceof HttpError && e.statusCode === 404,
    );
  });
});

test("queryResource falls back to the raw transcript when no RAG chunks are indexed yet", async () => {
  await withTempDb(async (workDir) => {
    const db = getDb();
    const user = new AuthService(db).register({ email: "user@example.com", fullName: "User", password: "password123" });
    await createOpenAiProvider(user.id);
    const docId = seedDocument(user.id, join(workDir, "notes.txt"));
    seedTranscript(user.id, docId, "the quarterly roadmap covers three initiatives");

    let capturedPrompt = "";
    const mockFetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const href = String(url instanceof URL ? url.href : typeof url === "string" ? url : url.url);
      if (href.includes("/embeddings")) {
        // No provider configured for embeddings in this test besides the chat one,
        // but AssetSearchService swallows embedding errors and returns [] — fine either way.
        return new Response(JSON.stringify({ data: [{ embedding: [1, 0, 0] }] }), { status: 200 });
      }
      const body = JSON.parse(String(init?.body));
      capturedPrompt = JSON.stringify(body.messages);
      return new Response(JSON.stringify({ choices: [{ message: { content: "It covers three initiatives." } }] }), { status: 200 });
    }) as typeof fetch;

    const answer = await withMockedFetch(mockFetch, () => new AssetService(db).queryResource(user.id, "document", docId, "what does it cover?"));

    assert.equal(answer, "It covers three initiatives.");
    assert.match(capturedPrompt, /quarterly roadmap/);
  });
});
