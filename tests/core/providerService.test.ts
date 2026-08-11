import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { eq } from "drizzle-orm";

import { __resetConfigForTests } from "../../core/config/index.js";
import { __resetSecretManagerForTests } from "../../core/crypto/index.js";
import { getDb, __resetDbForTests } from "../../core/db/client.js";
import { aiModels, providers, users } from "../../core/db/schema.js";
import { HttpError } from "../../core/errors.js";
import { ProviderService, toProviderResponse } from "../../core/providers/providerService.js";

async function withTempDb<T>(fn: () => T | Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "chikaima-provider-test-"));
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

function seedUser(): string {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();
  db.insert(users)
    .values({ id, email: `${id}@example.com`, fullName: "Test User", hashedPassword: "x", createdAt: now, updatedAt: now })
    .run();
  return id;
}

test("create() without an API key falls back to curated models and masks no secret", async () => {
  await withTempDb(async () => {
    const userId = seedUser();
    const service = new ProviderService(getDb());

    const provider = await service.create(userId, { name: "My OpenAI", providerType: "openai" });
    const response = toProviderResponse(provider);

    assert.equal(response.masked_secret, null);
    assert.equal(response.provider_type, "openai");
    assert.equal(response.is_enabled, true);
  });
});

test("create() with an API key stores it encrypted (never plaintext) and masks it in the response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("unauthorized", { status: 401 })) as typeof fetch;

  try {
    await withTempDb(async () => {
      const userId = seedUser();
      const service = new ProviderService(getDb());

      const provider = await service.create(userId, { name: "My OpenAI", providerType: "openai", apiKey: "sk-super-secret" });
      const config = provider.encryptedConfig as Record<string, unknown>;

      assert.notEqual(config.api_key, "sk-super-secret");
      assert.match(String(config.api_key), /^aesgcm:/);
      assert.equal(toProviderResponse(provider).masked_secret, "**********");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("create() seeds curated ai_models for the provider, with the first one marked default", async () => {
  await withTempDb(async () => {
    const userId = seedUser();
    const service = new ProviderService(getDb());

    await service.create(userId, { name: "My OpenAI", providerType: "openai" });
    const models = getDb().select().from(aiModels).all();

    assert.ok(models.length > 0);
    assert.equal(models.filter((m) => m.isDefault).length, 1);
  });
});

test("update() on a provider owned by a different user is rejected as not found", async () => {
  await withTempDb(async () => {
    const ownerId = seedUser();
    const otherUserId = seedUser();
    const service = new ProviderService(getDb());
    const provider = await service.create(ownerId, { name: "Mine", providerType: "openai" });

    await assert.rejects(
      () => service.update(otherUserId, provider.id, { name: "Hijacked" }),
      (error: unknown) => error instanceof HttpError && error.statusCode === 404,
    );
  });
});

test("delete() removes the provider row", async () => {
  await withTempDb(async () => {
    const userId = seedUser();
    const service = new ProviderService(getDb());
    const provider = await service.create(userId, { name: "Mine", providerType: "openai" });

    service.delete(userId, provider.id);

    assert.equal(service.listForUser(userId).length, 0);
  });
});

test("listAvailableModelsForUser excludes models from disabled providers and unavailable models", async () => {
  await withTempDb(async () => {
    const userId = seedUser();
    const service = new ProviderService(getDb());
    const enabledProvider = await service.create(userId, { name: "Enabled", providerType: "openai" });
    const disabledProvider = await service.create(userId, { name: "Disabled", providerType: "anthropic" });

    getDb().update(providers).set({ isEnabled: false }).where(eq(providers.id, disabledProvider.id)).run();
    const enabledModels = getDb().select().from(aiModels).where(eq(aiModels.providerId, enabledProvider.id)).all();
    assert.ok(enabledModels.length > 1, "fixture assumption: openai curated list has more than one model");
    getDb().update(aiModels).set({ isAvailable: false }).where(eq(aiModels.id, enabledModels[0]!.id)).run();

    const available = service.listAvailableModelsForUser(userId);

    assert.ok(available.every((model) => model.provider_id === enabledProvider.id));
    assert.equal(available.some((model) => model.id === enabledModels[0]!.id), false);
  });
});
