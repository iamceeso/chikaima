import assert from "node:assert/strict";
import test from "node:test";

import { SecretManager } from "../../core/crypto/index.js";

test("encrypt/decrypt round-trips a value", () => {
  const manager = new SecretManager("a-sufficiently-long-test-secret-key");
  const plaintext = "sk-live-abc123";
  const encrypted = manager.encrypt(plaintext);

  assert.ok(encrypted.startsWith("aesgcm:"));
  assert.notEqual(encrypted, plaintext);
  assert.equal(manager.decrypt(encrypted), plaintext);
});

test("encrypting the same value twice produces different ciphertext (random IV)", () => {
  const manager = new SecretManager("a-sufficiently-long-test-secret-key");
  const a = manager.encrypt("same-value");
  const b = manager.encrypt("same-value");
  assert.notEqual(a, b);
  assert.equal(manager.decrypt(a), "same-value");
  assert.equal(manager.decrypt(b), "same-value");
});

test("decrypt rejects a value that was not produced by encrypt", () => {
  const manager = new SecretManager("a-sufficiently-long-test-secret-key");
  assert.throws(() => manager.decrypt("not-encrypted-at-all"));
});

test("decrypt rejects a tampered ciphertext (authentication failure)", () => {
  const manager = new SecretManager("a-sufficiently-long-test-secret-key");
  const encrypted = manager.encrypt("sk-live-abc123");
  const tampered = encrypted.slice(0, -2) + (encrypted.endsWith("A") ? "B" : "A");
  assert.throws(() => manager.decrypt(tampered));
});

test("a different secret key cannot decrypt values encrypted with another key", () => {
  const a = new SecretManager("first-sufficiently-long-secret-key");
  const b = new SecretManager("second-sufficiently-long-secret-key");
  const encrypted = a.encrypt("sk-live-abc123");
  assert.throws(() => b.decrypt(encrypted));
});
