import assert from "node:assert/strict";
import test from "node:test";

import {
  dedupeModels,
  isDeprecatedModel,
  joinApiUrl,
  openaiCapabilities,
  shouldIncludeOpenaiModel,
  shouldIncludeOpenrouterModel,
  sortModels,
  titleizeModelName,
} from "../../core/providers/catalog.js";

test("dedupeModels drops blank keys and later duplicates, applying a chat-only capability default", () => {
  const result = dedupeModels([
    { key: "gpt-4o", name: "GPT-4o", capabilities: { chat: true, vision: true } },
    { key: "gpt-4o", name: "duplicate", capabilities: { chat: true } },
    { key: "  ", name: "blank", capabilities: {} },
    { key: "gpt-4o-mini", name: "", capabilities: undefined as never },
  ]);

  assert.deepEqual(
    result.map((m) => m.key),
    ["gpt-4o", "gpt-4o-mini"],
  );
  assert.deepEqual(result[0]?.capabilities, { chat: true, vision: true });
  assert.equal(result[1]?.name, "gpt-4o-mini");
  assert.deepEqual(result[1]?.capabilities, { chat: true });
});

test("sortModels orders by curated priority, falling back to alphabetical for unranked models", () => {
  const sorted = sortModels("openai", [
    { key: "gpt-4o-mini", name: "GPT-4o mini", capabilities: {} },
    { key: "unranked-z", name: "Z Model", capabilities: {} },
    { key: "gpt-5", name: "GPT-5", capabilities: {} },
    { key: "unranked-a", name: "A Model", capabilities: {} },
  ]);
  assert.deepEqual(
    sorted.map((m) => m.key),
    ["gpt-5", "gpt-4o-mini", "unranked-a", "unranked-z"],
  );
});

test("openaiCapabilities marks vision-capable model families and audio-capable models", () => {
  assert.deepEqual(openaiCapabilities("gpt-4o"), { chat: true, vision: true });
  assert.deepEqual(openaiCapabilities("gpt-4o-realtime-preview"), { chat: true, vision: true, audio: true });
  // "gpt-5" is itself one of the substring vision markers, so even the "nano" tier reports vision: true here.
  assert.deepEqual(openaiCapabilities("gpt-5-nano"), { chat: true, vision: true });
  assert.deepEqual(openaiCapabilities("o3-mini"), { chat: true, vision: false });
});

test("shouldIncludeOpenaiModel excludes non-chat OpenAI endpoints", () => {
  assert.ok(shouldIncludeOpenaiModel("gpt-4o"));
  assert.ok(!shouldIncludeOpenaiModel("whisper-1"));
  assert.ok(!shouldIncludeOpenaiModel("text-embedding-3-small"));
  assert.ok(!shouldIncludeOpenaiModel("dall-e-3"));
});

test("shouldIncludeOpenrouterModel excludes embedding/rerank/tts models only", () => {
  assert.ok(shouldIncludeOpenrouterModel("openai/gpt-4o-mini"));
  assert.ok(!shouldIncludeOpenrouterModel("openai/text-embedding-3-small"));
});

test("isDeprecatedModel flags known-deprecated keys per provider, not globally", () => {
  assert.ok(isDeprecatedModel("openai", "gpt-4"));
  assert.ok(!isDeprecatedModel("anthropic", "gpt-4"));
  assert.ok(!isDeprecatedModel("openai", "gpt-5"));
  assert.ok(!isDeprecatedModel(null, "gpt-4"));
});

test("titleizeModelName converts kebab/snake case into a readable title", () => {
  assert.equal(titleizeModelName("gpt-4o-mini"), "Gpt 4o Mini");
  assert.equal(titleizeModelName("claude_3_5_haiku"), "Claude 3 5 Haiku");
});

test("joinApiUrl appends a path without duplicating an already-present suffix", () => {
  assert.equal(joinApiUrl("http://localhost:4000/v1", "models"), "http://localhost:4000/v1/models");
  assert.equal(joinApiUrl("http://localhost:4000/v1/models", "models"), "http://localhost:4000/v1/models");
});
