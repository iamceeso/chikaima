import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AuthService } from "../../core/auth/authService.js";
import { __resetConfigForTests } from "../../core/config/index.js";
import { __resetSecretManagerForTests } from "../../core/crypto/index.js";
import { getDb, __resetDbForTests } from "../../core/db/client.js";
import { EmbeddingsService, NoEmbeddingProviderError } from "../../core/embeddings/embeddingsService.js";
import { AssetSearchService } from "../../core/rag/assetSearchService.js";
import { ProviderService } from "../../core/providers/providerService.js";

async function withTempDb<T>(fn: () => T | Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "chikaima-embeddings-test-"));
  const previous = process.env.CHIKAIMA_DB_PATH;
  process.env.CHIKAIMA_DB_PATH = join(dir, "test.db");
  __resetConfigForTests();
  __resetDbForTests();
  __resetSecretManagerForTests();
  try {
    return await fn();
  } finally {
    __resetDbForTests();
    __resetConfigForTests();
    __resetSecretManagerForTests();
    if (previous === undefined) delete process.env.CHIKAIMA_DB_PATH;
    else process.env.CHIKAIMA_DB_PATH = previous;
    rmSync(dir, { recursive: true, force: true });
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

async function createOpenAiProvider(userId: string): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("unauthorized", { status: 401 })) as typeof fetch;
  try {
    await new ProviderService(getDb()).create(userId, { name: "My OpenAI", providerType: "openai", apiKey: "sk-test" });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("generateEmbedding raises NoEmbeddingProviderError when nothing is configured", async () => {
  await withTempDb(async () => {
    const db = getDb();
    const user = new AuthService(db).register({ email: "user@example.com", fullName: "User", password: "password123" });

    await assert.rejects(() => new EmbeddingsService(db).generateEmbedding(user.id, "hello"), NoEmbeddingProviderError);
  });
});

test("generateEmbedding pads a short provider vector out to the configured dimension", async () => {
  await withTempDb(async () => {
    const db = getDb();
    const user = new AuthService(db).register({ email: "user@example.com", fullName: "User", password: "password123" });
    await createOpenAiProvider(user.id);

    const embedding = await withMockedFetch(
      (async () => new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }), { status: 200 })) as typeof fetch,
      () => new EmbeddingsService(db).generateEmbedding(user.id, "hello"),
    );

    assert.equal(embedding.length, 384);
    assert.deepEqual(embedding.slice(0, 3), [0.1, 0.2, 0.3]);
    assert.ok(embedding.slice(3).every((v) => v === 0));
  });
});

test("generateEmbedding truncates an oversized provider vector down to the configured dimension", async () => {
  await withTempDb(async () => {
    const db = getDb();
    const user = new AuthService(db).register({ email: "user@example.com", fullName: "User", password: "password123" });
    await createOpenAiProvider(user.id);

    const oversized = new Array(500).fill(0).map((_, i) => i);
    const embedding = await withMockedFetch(
      (async () => new Response(JSON.stringify({ data: [{ embedding: oversized }] }), { status: 200 })) as typeof fetch,
      () => new EmbeddingsService(db).generateEmbedding(user.id, "hello"),
    );

    assert.equal(embedding.length, 384);
    assert.equal(embedding[0], 0);
    assert.equal(embedding[383], 383);
  });
});

test("replaceChunksForSource replaces prior chunks for the same source (delete-then-insert)", async () => {
  await withTempDb(async () => {
    const db = getDb();
    const user = new AuthService(db).register({ email: "user@example.com", fullName: "User", password: "password123" });
    await createOpenAiProvider(user.id);
    const service = new EmbeddingsService(db);

    await withMockedFetch(
      (async () => new Response(JSON.stringify({ data: [{ embedding: [1, 0, 0] }] }), { status: 200 })) as typeof fetch,
      () =>
        service.replaceChunksForSource({
          userId: user.id,
          sourceType: "document",
          sourceId: "doc-1",
          assetType: "document",
          filename: "v1.pdf",
          chunks: [{ content: "first version", metadata: {} }],
        }),
    );

    const secondResult = await withMockedFetch(
      (async () => new Response(JSON.stringify({ data: [{ embedding: [1, 0, 0] }] }), { status: 200 })) as typeof fetch,
      () =>
        service.replaceChunksForSource({
          userId: user.id,
          sourceType: "document",
          sourceId: "doc-1",
          assetType: "document",
          filename: "v2.pdf",
          chunks: [{ content: "second version A", metadata: {} }, { content: "second version B", metadata: {} }],
        }),
    );

    assert.equal(secondResult.length, 2);

    const searchResults = await withMockedFetch(
      (async () => new Response(JSON.stringify({ data: [{ embedding: [1, 0, 0] }] }), { status: 200 })) as typeof fetch,
      () => new AssetSearchService(db).search(user.id, "anything", { limit: 5 }),
    );

    assert.equal(searchResults.length, 1);
    assert.equal(searchResults[0]?.filename, "v2.pdf");
    assert.equal(searchResults[0]?.chunks.length, 2);
  });
});

test("replaceChunksForSource skips blank chunks and returns an empty array with no configured provider", async () => {
  await withTempDb(async () => {
    const db = getDb();
    const user = new AuthService(db).register({ email: "user@example.com", fullName: "User", password: "password123" });

    const result = await new EmbeddingsService(db).replaceChunksForSource({
      userId: user.id,
      sourceType: "document",
      sourceId: "doc-1",
      assetType: "document",
      filename: "v1.pdf",
      chunks: [{ content: "  ", metadata: {} }],
    });

    assert.deepEqual(result, []);
  });
});

test("AssetSearchService.search returns [] instead of throwing when embedding generation fails", async () => {
  await withTempDb(async () => {
    const db = getDb();
    const user = new AuthService(db).register({ email: "user@example.com", fullName: "User", password: "password123" });

    const results = await new AssetSearchService(db).search(user.id, "anything");
    assert.deepEqual(results, []);
  });
});

test("AssetSearchService.search returns [] for a blank query without generating an embedding", async () => {
  await withTempDb(async () => {
    const db = getDb();
    const user = new AuthService(db).register({ email: "user@example.com", fullName: "User", password: "password123" });

    const results = await new AssetSearchService(db).search(user.id, "   ");
    assert.deepEqual(results, []);
  });
});
