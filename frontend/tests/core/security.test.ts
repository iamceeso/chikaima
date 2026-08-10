import assert from "node:assert/strict";
import test from "node:test";

import {
  createAccessToken,
  createPasswordResetToken,
  createRefreshToken,
  decodeToken,
  hashPassword,
  InvalidTokenError,
  verifyPassword,
} from "../../core/security/index.js";

test("hashPassword produces a verifiable, salted hash", () => {
  const hash = hashPassword("correct horse battery staple");
  assert.match(hash, /^pbkdf2_sha256\$\d+\$.+\$.+$/);
  assert.ok(verifyPassword("correct horse battery staple", hash));
  assert.ok(!verifyPassword("wrong password", hash));
});

test("hashPassword salts each hash differently", () => {
  const a = hashPassword("same-password");
  const b = hashPassword("same-password");
  assert.notEqual(a, b);
  assert.ok(verifyPassword("same-password", a));
  assert.ok(verifyPassword("same-password", b));
});

test("verifyPassword rejects malformed hashes instead of throwing", () => {
  assert.equal(verifyPassword("anything", "not-a-real-hash"), false);
});

test("access tokens round-trip through decodeToken", async () => {
  const token = await createAccessToken("user-123");
  const payload = await decodeToken(token, { expectedType: "access" });
  assert.equal(payload.sub, "user-123");
  assert.equal(payload.type, "access");
});

test("refresh tokens require the refresh secret and refresh flag", async () => {
  const token = await createRefreshToken("user-123");
  const payload = await decodeToken(token, { refresh: true, expectedType: "refresh" });
  assert.equal(payload.sub, "user-123");

  await assert.rejects(() => decodeToken(token, { refresh: false, expectedType: "refresh" }), InvalidTokenError);
});

test("decodeToken rejects a token used with the wrong expected type", async () => {
  const token = await createAccessToken("user-123");
  await assert.rejects(() => decodeToken(token, { expectedType: "refresh" }), InvalidTokenError);
});

test("decodeToken rejects an expired token", async () => {
  const token = await createAccessToken("user-123", -10);
  await assert.rejects(() => decodeToken(token, { expectedType: "access" }), InvalidTokenError);
});

test("password reset tokens are signed with the access-token secret and carry their own type", async () => {
  const token = await createPasswordResetToken("user-123");
  const payload = await decodeToken(token, { expectedType: "password_reset" });
  assert.equal(payload.sub, "user-123");
});
