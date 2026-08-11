import assert from "node:assert/strict";
import test from "node:test";

import { chunkText, TEXT_CHUNK_OVERLAP, TEXT_CHUNK_SIZE } from "../../core/chunking/index.js";

test("chunkText returns an empty array for blank input", () => {
  assert.deepEqual(chunkText(""), []);
  assert.deepEqual(chunkText("   \n\t  "), []);
});

test("chunkText normalizes internal whitespace and returns a single chunk for short text", () => {
  const chunks = chunkText("hello   \n\n  world  \t foo");
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0]?.content, "hello world foo");
});

test("chunkText attaches the provided base metadata to every chunk", () => {
  const chunks = chunkText("short text", { page: 3 });
  assert.deepEqual(chunks[0]?.metadata, { page: 3 });
});

test("chunkText splits long text into overlapping windows covering the whole input", () => {
  const text = Array.from({ length: 12_000 }, (_, i) => `word${i % 10}`).join(" ");
  const chunks = chunkText(text);

  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.ok(chunk.content.length <= TEXT_CHUNK_SIZE);
  }

  // Consecutive chunks overlap by roughly TEXT_CHUNK_OVERLAP characters.
  const step = TEXT_CHUNK_SIZE - TEXT_CHUNK_OVERLAP;
  const normalized = text.split(/\s+/).filter(Boolean).join(" ");
  const expectedChunkCount = Math.ceil((normalized.length - TEXT_CHUNK_OVERLAP) / step);
  assert.ok(Math.abs(chunks.length - expectedChunkCount) <= 1);
});
