import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AuthService } from "../../core/auth/authService.js";
import { __resetConfigForTests } from "../../core/config/index.js";
import { __resetSecretManagerForTests } from "../../core/crypto/index.js";
import { getDb, __resetDbForTests } from "../../core/db/client.js";
import { documents, videos } from "../../core/db/schema.js";
import { DashboardService } from "../../core/dashboard/dashboardService.js";
import { LibraryService } from "../../core/library/libraryService.js";
import { ProviderService } from "../../core/providers/providerService.js";

async function withTempDb<T>(fn: () => T | Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "chikaima-dashboard-test-"));
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

test("DashboardService.getSummary counts only the requesting user's resources", async () => {
  await withTempDb(async () => {
    const db = getDb();
    const user = new AuthService(db).register({ email: "user@example.com", fullName: "User", password: "password123" });
    const other = new AuthService(db).register({ email: "other@example.com", fullName: "Other", password: "password123" });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("unauthorized", { status: 401 })) as typeof fetch;
    try {
      await new ProviderService(db).create(user.id, { name: "OpenAI", providerType: "openai", apiKey: "sk-test" });
    } finally {
      globalThis.fetch = originalFetch;
    }

    const now = new Date().toISOString();
    db.insert(documents).values({ id: "doc-1", userId: user.id, name: "a.txt", filePath: "/tmp/a.txt", mimeType: "text/plain", status: "completed", createdAt: now, updatedAt: now }).run();
    db.insert(documents).values({ id: "doc-2", userId: other.id, name: "b.txt", filePath: "/tmp/b.txt", mimeType: "text/plain", status: "completed", createdAt: now, updatedAt: now }).run();
    db.insert(videos).values({ id: "vid-1", userId: user.id, name: "v.mp4", filePath: "/tmp/v.mp4", status: "completed", createdAt: now, updatedAt: now }).run();

    const summary = new DashboardService(db).getSummary(user.id);
    assert.equal(summary.providers, 1);
    assert.ok(summary.models > 0);
    assert.equal(summary.documents, 1);
    assert.equal(summary.videos, 1);
    assert.equal(summary.system_health, "healthy");
  });
});

test("LibraryService.getBundle returns only the requesting user's assets, mapped to snake_case response fields", async () => {
  await withTempDb(() => {
    const db = getDb();
    const user = new AuthService(db).register({ email: "user@example.com", fullName: "User", password: "password123" });
    const other = new AuthService(db).register({ email: "other@example.com", fullName: "Other", password: "password123" });

    const now = new Date().toISOString();
    db.insert(documents).values({ id: "doc-1", userId: user.id, name: "a.txt", filePath: "/tmp/a.txt", mimeType: "text/plain", status: "completed", createdAt: now, updatedAt: now }).run();
    db.insert(documents).values({ id: "doc-2", userId: other.id, name: "b.txt", filePath: "/tmp/b.txt", mimeType: "text/plain", status: "completed", createdAt: now, updatedAt: now }).run();

    const bundle = new LibraryService(db).getBundle(user.id);
    assert.equal(bundle.documents.length, 1);
    assert.equal(bundle.documents[0]?.file_path, "/tmp/a.txt");
    assert.equal(bundle.documents[0]?.mime_type, "text/plain");
    assert.deepEqual(bundle.audio, []);
    assert.deepEqual(bundle.videos, []);
  });
});
