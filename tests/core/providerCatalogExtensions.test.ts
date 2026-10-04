import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { eq } from "drizzle-orm";

import { LLMService } from "../../core/chat/llmService.js";
import { __resetConfigForTests } from "../../core/config/index.js";
import { __resetSecretManagerForTests } from "../../core/crypto/index.js";
import { getDb, __resetDbForTests } from "../../core/db/client.js";
import { aiModels, users } from "../../core/db/schema.js";
import { isEconomyModel, providerSupportTier } from "../../core/providers/catalog.js";
import { ProviderService, toProviderResponse } from "../../core/providers/providerService.js";
import { __resetUserCatalogForTests, getCuratedModels, mergeUserModels } from "../../core/providers/userCatalog.js";

async function withTempEnv<T>(fn: (dir: string) => T | Promise<T>, env: Record<string, string> = {}): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "chikaima-catalog-test-"));
  const vars = { CHIKAIMA_DB_PATH: join(dir, "test.db"), ...env };
  const previous = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  const reset = () => {
    __resetDbForTests();
    __resetConfigForTests();
    __resetSecretManagerForTests();
    __resetUserCatalogForTests();
  };
  reset();
  try {
    return await fn(dir);
  } finally {
    reset();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

function seedUser(): string {
  const id = randomUUID();
  const now = new Date().toISOString();
  getDb()
    .insert(users)
    .values({ id, email: `${id}@example.com`, fullName: "Test User", hashedPassword: "x", createdAt: now, updatedAt: now })
    .run();
  return id;
}

test("isEconomyModel infers cheap tiers from the name, and an explicit capability overrides it", () => {
  for (const key of ["gpt-5-mini", "gpt-4.1-nano", "claude-haiku-4-5-20251001", "gemini-2.5-flash", "gemini-2.5-flash-lite", "o4-mini"]) {
    assert.equal(isEconomyModel(key), true, key);
  }
  for (const key of ["gpt-5.2", "claude-opus-5-5", "claude-sonnet-5-5", "gemini-2.5-pro", "minimax-m1"]) {
    assert.equal(isEconomyModel(key), false, key);
  }
  assert.equal(isEconomyModel("gpt-5-mini", { chat: true, economy: false }), false);
  assert.equal(isEconomyModel("my-tuned-model", { economy: true }), true);
});

test("providerSupportTier distinguishes dedicated adapters from OpenAI-compatible ones", () => {
  assert.equal(providerSupportTier("anthropic"), "verified");
  assert.equal(providerSupportTier("litellm"), "partial");
  assert.equal(providerSupportTier("something-new"), "unverified");
});

test("the user catalog overrides built-in entries by key and appends new ones", async () => {
  await withTempEnv(async (dir) => {
    const path = join(dir, "providers.json");
    writeFileSync(
      path,
      JSON.stringify({
        models: {
          anthropic: [
            { key: "claude-haiku-4-5-20251001", name: "Haiku (renamed)", capabilities: { chat: true, economy: true } },
            { key: "claude-future-1", name: "Claude Future" },
          ],
        },
      }),
    );

    const curated = getCuratedModels("anthropic");
    assert.equal(curated.find((model) => model.key === "claude-haiku-4-5-20251001")?.name, "Haiku (renamed)");
    assert.deepEqual(curated.at(-1), { key: "claude-future-1", name: "Claude Future", capabilities: { chat: true } });
    assert.deepEqual(mergeUserModels("openai", [{ key: "x", name: "X", capabilities: {} }]), [{ key: "x", name: "X", capabilities: {} }]);
  });
});

test("the default catalog path sits next to the database, and an invalid file is ignored", async () => {
  await withTempEnv(async (dir) => {
    writeFileSync(join(dir, "providers.json"), "{ not json");
    const originalWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (message: string) => warnings.push(message);
    try {
      assert.equal(getCuratedModels("anthropic").length > 0, true);
    } finally {
      console.warn = originalWarn;
    }
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!, /Ignoring invalid provider catalog/);
  });
});

test("user catalog models are synced onto a provider alongside the built-in fallback", async () => {
  await withTempEnv(async (dir) => {
    writeFileSync(join(dir, "providers.json"), JSON.stringify({ models: { openai: [{ key: "gpt-custom", name: "Custom" }] } }));
    const userId = seedUser();
    const provider = await new ProviderService(getDb()).create(userId, { name: "OpenAI", providerType: "openai" });

    const keys = getDb()
      .select()
      .from(aiModels)
      .where(eq(aiModels.providerId, provider.id))
      .all()
      .map((model) => model.modelKey);
    assert.ok(keys.includes("gpt-custom"));
    assert.ok(keys.includes("gpt-5.2"));
    assert.equal(toProviderResponse(provider).support_tier, "verified");
  });
});

test("background work tries the provider's best-ranked economy model first, then the default", async () => {
  await withTempEnv(async () => {
    const userId = seedUser();
    await new ProviderService(getDb()).create(userId, { name: "OpenAI", providerType: "openai" });

    const candidates = new LLMService(getDb()).resolveBackgroundCandidates(userId);
    assert.deepEqual(
      candidates.map((candidate) => candidate.model.modelKey),
      ["gpt-5-mini", "gpt-5.2"],
    );
  });
});

test("background routing can be turned off, always using the default model", async () => {
  await withTempEnv(
    async () => {
      const userId = seedUser();
      await new ProviderService(getDb()).create(userId, { name: "OpenAI", providerType: "openai" });
      const candidates = new LLMService(getDb()).resolveBackgroundCandidates(userId);
      assert.deepEqual(
        candidates.map((candidate) => candidate.model.modelKey),
        ["gpt-5.2"],
      );
    },
    { CHIKAIMA_BACKGROUND_MODEL_ROUTING: "default" },
  );
});
