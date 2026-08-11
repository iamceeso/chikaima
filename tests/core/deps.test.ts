import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AuthService } from "../../core/auth/authService.js";
import { getCurrentAdminUser, getCurrentUser } from "../../core/auth/deps.js";
import { WorkspaceService } from "../../core/auth/workspaceService.js";
import { __resetConfigForTests } from "../../core/config/index.js";
import { getDb, __resetDbForTests } from "../../core/db/client.js";
import { HttpError } from "../../core/errors.js";

async function withTempDb<T>(fn: () => T | Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "chikaima-deps-test-"));
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

test("getCurrentUser rejects a missing bearer token when auth is enabled", async () => {
  await withTempDb(async () => {
    const db = getDb();
    await assert.rejects(() => getCurrentUser(db, null), (error: unknown) => error instanceof HttpError && error.statusCode === 401);
  });
});

test("getCurrentUser accepts a valid bearer token and returns the matching user", async () => {
  await withTempDb(async () => {
    const db = getDb();
    const service = new AuthService(db);
    service.register({ email: "user@example.com", fullName: "User", password: "password123" });
    const { accessToken } = await service.login({ email: "user@example.com", password: "password123" });

    const user = await getCurrentUser(db, `Bearer ${accessToken}`);
    assert.equal(user.email, "user@example.com");
  });
});

test("getCurrentUser falls back to a shared public actor when workspace auth is disabled", async () => {
  await withTempDb(async () => {
    const db = getDb();
    const service = new AuthService(db);
    const admin = service.register({ email: "admin@example.com", fullName: "Admin", password: "password123" });
    new WorkspaceService(db).update(admin, { authenticationEnabled: false });

    const actorA = await getCurrentUser(db, null);
    const actorB = await getCurrentUser(db, null);
    assert.equal(actorA.id, actorB.id);
    assert.equal(actorA.email, "workspace-public@chikaima.app");
  });
});

test("getCurrentAdminUser requires superuser when auth is enabled", async () => {
  await withTempDb(async () => {
    const db = getDb();
    const service = new AuthService(db);
    const admin = service.register({ email: "admin@example.com", fullName: "Admin", password: "password123" });
    const regular = service.createUser(admin, { email: "user@example.com", fullName: "User", password: "password123", isSuperuser: false, isActive: true });

    const { accessToken: adminToken } = await service.login({ email: "admin@example.com", password: "password123" });
    const { accessToken: userToken } = await service.login({ email: "user@example.com", password: "password123" });
    void regular;

    const resolvedAdmin = await getCurrentAdminUser(db, `Bearer ${adminToken}`);
    assert.equal(resolvedAdmin.isSuperuser, true);

    await assert.rejects(() => getCurrentAdminUser(db, `Bearer ${userToken}`), (error: unknown) => error instanceof HttpError && error.statusCode === 403);
  });
});

test("getCurrentAdminUser falls back to HTTP Basic auth when workspace auth is disabled", async () => {
  await withTempDb(async () => {
    const db = getDb();
    const service = new AuthService(db);
    const admin = service.register({ email: "admin@example.com", fullName: "Admin", password: "password123" });
    new WorkspaceService(db).update(admin, { authenticationEnabled: false });

    const basic = `Basic ${Buffer.from("admin@example.com:password123").toString("base64")}`;
    const resolved = await getCurrentAdminUser(db, basic);
    assert.equal(resolved.id, admin.id);

    const wrongBasic = `Basic ${Buffer.from("admin@example.com:wrong").toString("base64")}`;
    await assert.rejects(() => getCurrentAdminUser(db, wrongBasic), (error: unknown) => error instanceof HttpError && error.statusCode === 401);
  });
});
