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

async function withTempDb<T>(fn: () => T | Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "chikaima-auth-test-"));
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

test("the first registered user becomes a superuser; later ones do not", async () => {
  await withTempDb(() => {
    const service = new AuthService(getDb());
    const first = service.register({ email: "first@example.com", fullName: "First", password: "password123" });
    const second = service.register({ email: "second@example.com", fullName: "Second", password: "password123" });

    assert.equal(first.isSuperuser, true);
    assert.equal(second.isSuperuser, false);
  });
});

test("register rejects a duplicate email", async () => {
  await withTempDb(() => {
    const service = new AuthService(getDb());
    service.register({ email: "dup@example.com", fullName: "Dup", password: "password123" });

    assert.throws(
      () => service.register({ email: "dup@example.com", fullName: "Dup Two", password: "password123" }),
      (error: unknown) => error instanceof HttpError && error.statusCode === 400,
    );
  });
});

test("register rejects a second user when public registration is disabled", async () => {
  await withTempDb(() => {
    const db = getDb();
    const service = new AuthService(db);
    const first = service.register({ email: "admin@example.com", fullName: "Admin", password: "password123" });

    new WorkspaceService(db).update(first, { publicRegistrationEnabled: false });

    assert.throws(
      () => service.register({ email: "second@example.com", fullName: "Second", password: "password123" }),
      (error: unknown) => error instanceof HttpError && error.statusCode === 403,
    );
  });
});

test("login succeeds with correct credentials and fails with wrong password", async () => {
  await withTempDb(async () => {
    const service = new AuthService(getDb());
    service.register({ email: "user@example.com", fullName: "User", password: "correct-password" });

    const { user, accessToken, refreshToken } = await service.login({ email: "user@example.com", password: "correct-password" });
    assert.equal(user.email, "user@example.com");
    assert.ok(accessToken);
    assert.ok(refreshToken);

    await assert.rejects(
      () => service.login({ email: "user@example.com", password: "wrong-password" }),
      (error: unknown) => error instanceof HttpError && error.statusCode === 401,
    );
  });
});

test("login rejects an inactive user even with correct credentials", async () => {
  await withTempDb(async () => {
    const db = getDb();
    const service = new AuthService(db);
    const admin = service.register({ email: "admin@example.com", fullName: "Admin", password: "password123" });
    const target = service.createUser(admin, { email: "inactive@example.com", fullName: "Inactive", password: "password123", isSuperuser: false, isActive: false });
    assert.equal(target.isActive, false);

    await assert.rejects(
      () => service.login({ email: "inactive@example.com", password: "password123" }),
      (error: unknown) => error instanceof HttpError && error.statusCode === 403,
    );
  });
});

test("refresh() mints a new access token from a valid refresh token", async () => {
  await withTempDb(async () => {
    const service = new AuthService(getDb());
    service.register({ email: "user@example.com", fullName: "User", password: "password123" });
    const { refreshToken } = await service.login({ email: "user@example.com", password: "password123" });

    const accessToken = await service.refresh(refreshToken);
    assert.ok(accessToken);
  });
});

test("refresh() rejects an access token presented as a refresh token", async () => {
  await withTempDb(async () => {
    const service = new AuthService(getDb());
    service.register({ email: "user@example.com", fullName: "User", password: "password123" });
    const { accessToken } = await service.login({ email: "user@example.com", password: "password123" });

    await assert.rejects(() => service.refresh(accessToken), (error: unknown) => error instanceof HttpError && error.statusCode === 401);
  });
});

test("the last remaining admin cannot be demoted or deactivated", async () => {
  await withTempDb(() => {
    const service = new AuthService(getDb());
    const admin = service.register({ email: "admin@example.com", fullName: "Admin", password: "password123" });

    assert.throws(
      () => service.updateUser(admin, admin.id, { isSuperuser: false }),
      (error: unknown) => error instanceof HttpError && error.statusCode === 400,
    );
    assert.throws(
      () => service.updateUser(admin, admin.id, { isActive: false }),
      (error: unknown) => error instanceof HttpError && error.statusCode === 400,
    );
  });
});

test("a non-admin cannot create or update users", async () => {
  await withTempDb(() => {
    const service = new AuthService(getDb());
    const admin = service.register({ email: "admin@example.com", fullName: "Admin", password: "password123" });
    const regular = service.createUser(admin, { email: "user@example.com", fullName: "User", password: "password123", isSuperuser: false, isActive: true });

    assert.throws(
      () => service.createUser(regular, { email: "another@example.com", fullName: "Another", password: "password123", isSuperuser: false, isActive: true }),
      (error: unknown) => error instanceof HttpError && error.statusCode === 403,
    );
  });
});

test("password reset: request issues no error for unknown emails (no user enumeration) and confirm updates the password", async () => {
  await withTempDb(async () => {
    const db = getDb();
    const service = new AuthService(db);
    service.register({ email: "user@example.com", fullName: "User", password: "old-password" });

    const unknownResponse = await service.requestPasswordReset("unknown@example.com");
    assert.match(unknownResponse.message, /If the account exists/);

    const user = service.users.getByEmail("user@example.com")!;
    const { createPasswordResetToken } = await import("../../core/security/index.js");
    const token = await createPasswordResetToken(user.id);

    await service.confirmPasswordReset({ token, newPassword: "new-password123" });

    const { user: loggedIn } = await service.login({ email: "user@example.com", password: "new-password123" });
    assert.equal(loggedIn.id, user.id);
  });
});
