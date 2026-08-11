import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { __resetConfigForTests } from "../../core/config/index.js";
import { getDb, __resetDbForTests } from "../../core/db/client.js";
import { users } from "../../core/db/schema.js";
import { VectorStore } from "../../core/rag/vectorStore.js";

// The asset_chunk_vectors vec0 virtual table is created with a fixed
// float[384] column (see core/db/migrations/0004_indexes_and_vectors.sql),
// so every test vector must be exactly 384-dimensional regardless of how
// few "meaningful" components it needs.
const EMBEDDING_DIM = 384;

async function withTempDb<T>(fn: () => T | Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "chikaima-vecstore-test-"));
  const previous = process.env.CHIKAIMA_DB_PATH;
  process.env.CHIKAIMA_DB_PATH = join(dir, "test.db");
  __resetConfigForTests();
  __resetDbForTests();
  try {
    return await fn();
  } finally {
    __resetDbForTests();
    __resetConfigForTests();
    if (previous === undefined) delete process.env.CHIKAIMA_DB_PATH;
    else process.env.CHIKAIMA_DB_PATH = previous;
    rmSync(dir, { recursive: true, force: true });
  }
}

function seedUser(id: string): void {
  const now = new Date().toISOString();
  getDb()
    .insert(users)
    .values({ id, email: `${id}@example.com`, fullName: id, hashedPassword: "x", createdAt: now, updatedAt: now })
    .run();
}

/** A 384-dim vector with the given leading components, zero-padded. */
function vec(...leading: number[]): number[] {
  return [...leading, ...new Array(EMBEDDING_DIM - leading.length).fill(0)];
}

function unitVector(hotIndex: number): number[] {
  const vector = new Array(EMBEDDING_DIM).fill(0);
  vector[hotIndex] = 1;
  return vector;
}

test("insertChunks stores metadata and vectors that search() can retrieve by nearest match", async () => {
  await withTempDb(async () => {
    seedUser("user-1");
    const store = new VectorStore(getDb());
    await store.insertChunks({
      userId: "user-1",
      sourceType: "document",
      sourceId: "doc-1",
      assetType: "document",
      filename: "report.pdf",
      chunks: [
        { content: "chunk about apples", metadata: { page: 1 }, embedding: unitVector(0) },
        { content: "chunk about oranges", metadata: { page: 2 }, embedding: unitVector(1) },
      ],
    });

    const results = store.search("user-1", unitVector(0), { limit: 5 });
    assert.equal(results.length, 1);
    assert.equal(results[0]?.sourceId, "doc-1");
    assert.equal(results[0]?.chunks[0]?.chunk.content, "chunk about apples");
    assert.ok(results[0]!.score > 0.99);
  });
});

test("search ranks results by best-matching chunk and filters by user", async () => {
  await withTempDb(async () => {
    seedUser("user-1");
    seedUser("user-2");
    const store = new VectorStore(getDb());
    await store.insertChunks({
      userId: "user-1",
      sourceType: "document",
      sourceId: "doc-1",
      assetType: "document",
      filename: "close.pdf",
      chunks: [{ content: "somewhat close", metadata: {}, embedding: vec(1, 0.9) }],
    });
    await store.insertChunks({
      userId: "user-1",
      sourceType: "document",
      sourceId: "doc-2",
      assetType: "document",
      filename: "exact.pdf",
      chunks: [{ content: "exact match", metadata: {}, embedding: vec(1) }],
    });
    await store.insertChunks({
      userId: "user-2",
      sourceType: "document",
      sourceId: "doc-3",
      assetType: "document",
      filename: "other-user.pdf",
      chunks: [{ content: "belongs to someone else", metadata: {}, embedding: vec(1) }],
    });

    const results = store.search("user-1", vec(1), { limit: 5 });
    assert.equal(results.length, 2);
    assert.equal(results[0]?.sourceId, "doc-2");
    assert.equal(results[1]?.sourceId, "doc-1");
    assert.ok(!results.some((r) => r.sourceId === "doc-3"));
  });
});

test("search honors sourceFilters as an OR across kinds and excludes non-matching sources", async () => {
  await withTempDb(async () => {
    seedUser("u1");
    const store = new VectorStore(getDb());
    await store.insertChunks({ userId: "u1", sourceType: "document", sourceId: "d1", assetType: "document", filename: "d1.pdf", chunks: [{ content: "doc", metadata: {}, embedding: vec(1) }] });
    await store.insertChunks({ userId: "u1", sourceType: "audio", sourceId: "a1", assetType: "audio", filename: "a1.mp3", chunks: [{ content: "audio", metadata: {}, embedding: vec(1) }] });
    await store.insertChunks({ userId: "u1", sourceType: "video", sourceId: "v1", assetType: "video", filename: "v1.mp4", chunks: [{ content: "video", metadata: {}, embedding: vec(1) }] });

    const results = store.search("u1", vec(1), { limit: 10, sourceFilters: { document: new Set(["d1"]), audio: new Set(["a1"]) } });
    const sourceIds = results.map((r) => r.sourceId).sort();
    assert.deepEqual(sourceIds, ["a1", "d1"]);
  });
});

test("search caps chunks per source at 3 even when more chunks match", async () => {
  await withTempDb(async () => {
    seedUser("u1");
    const store = new VectorStore(getDb());
    await store.insertChunks({
      userId: "u1",
      sourceType: "document",
      sourceId: "d1",
      assetType: "document",
      filename: "d1.pdf",
      chunks: Array.from({ length: 5 }, (_, i) => ({ content: `chunk ${i}`, metadata: { chunk_index: i }, embedding: vec(1) })),
    });

    const results = store.search("u1", vec(1), { limit: 5 });
    assert.equal(results.length, 1);
    assert.equal(results[0]?.chunks.length, 3);
  });
});

test("deleteBySource removes both metadata rows and their vectors", async () => {
  await withTempDb(async () => {
    seedUser("u1");
    const store = new VectorStore(getDb());
    await store.insertChunks({
      userId: "u1",
      sourceType: "document",
      sourceId: "d1",
      assetType: "document",
      filename: "d1.pdf",
      chunks: [{ content: "a", metadata: {}, embedding: vec(1) }],
    });

    const removed = store.deleteBySource("u1", "document", "d1");
    assert.equal(removed, 1);

    const results = store.search("u1", vec(1), { limit: 5 });
    assert.equal(results.length, 0);
  });
});

test("search returns nothing for a source_type with zero chunks", async () => {
  await withTempDb(async () => {
    const store = new VectorStore(getDb());
    const results = store.search("u1", vec(1), { limit: 5, sourceType: "document" });
    assert.deepEqual(results, []);
  });
});
