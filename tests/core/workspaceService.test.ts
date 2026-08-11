import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AuthService } from "../../core/auth/authService.js";
import { WorkspaceService } from "../../core/auth/workspaceService.js";
import { __resetConfigForTests } from "../../core/config/index.js";
import { getDb, __resetDbForTests } from "../../core/db/client.js";
import { HttpError } from "../../core/errors.js";
import { ProviderService } from "../../core/providers/providerService.js";

async function withTempDb<T>(fn: () => T | Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "chikaima-workspace-test-"));
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

test("getOrCreate seeds a default workspace config exactly once", async () => {
  await withTempDb(() => {
    const db = getDb();
    const service = new WorkspaceService(db);
    const first = service.getOrCreate();
    const second = service.getOrCreate();
    assert.equal(first.id, second.id);
    assert.equal(first.name, "Chikaima Workspace");
  });
});

test("update() requires an admin actor", async () => {
  await withTempDb(async () => {
    const db = getDb();
    const authService = new AuthService(db);
    const admin = authService.register({ email: "admin@example.com", fullName: "Admin", password: "password123" });
    const regular = authService.createUser(admin, { email: "user@example.com", fullName: "User", password: "password123", isSuperuser: false, isActive: true });

    assert.throws(
      () => new WorkspaceService(db).update(regular, { name: "Hijacked" }),
      (error: unknown) => error instanceof HttpError && error.statusCode === 403,
    );
  });
});

test("updateModelVisibility toggles availability and respects an explicit default-model selection", async () => {
  await withTempDb(async () => {
    const db = getDb();
    const authService = new AuthService(db);
    const workspaceService = new WorkspaceService(db);
    const admin = authService.register({ email: "admin@example.com", fullName: "Admin", password: "password123" });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("unauthorized", { status: 401 })) as typeof fetch;
    let provider;
    try {
      provider = await new ProviderService(db).create(admin.id, { name: "OpenAI", providerType: "openai" });
    } finally {
      globalThis.fetch = originalFetch;
    }
    void provider;

    const models = workspaceService.listModels(admin);
    assert.ok(models.length >= 2);

    const [first, second] = models;
    const updated = workspaceService.updateModelVisibility(
      admin,
      { enabledModelIds: [second!.id], defaultModelId: second!.id, defaultModelIdProvided: true },
      admin,
    );

    const updatedFirst = updated.find((m) => m.id === first!.id)!;
    const updatedSecond = updated.find((m) => m.id === second!.id)!;
    assert.equal(updatedFirst.is_available, false);
    assert.equal(updatedSecond.is_available, true);
    assert.equal(updatedSecond.is_default, true);
    assert.equal(updatedFirst.is_default, false);
  });
});
