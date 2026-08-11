import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { getConfig } from "../config/index.js";

/**
 * Provider-credential encryption, ported per an explicit "fresh start"
 * decision (not a byte-compatible port of the Python backend's Fernet
 * scheme): AES-256-GCM instead of Fernet's AES-128-CBC+HMAC construction.
 * Existing Fernet-encrypted values from a prior Postgres deployment cannot
 * be decrypted by this module — operators re-enter provider API keys once
 * after migrating. AES-GCM is authenticated (like Fernet) but is the more
 * current, simpler-to-get-right primitive and needs no extra HMAC step.
 *
 * Key is derived the same way as the Python backend (SHA-256 of the
 * configured secret) purely so a 16+ char human-typed secret always yields a
 * valid 32-byte key; this is a key-derivation convenience, not a
 * compatibility bridge.
 */
const ENCRYPTED_VALUE_PREFIX = "aesgcm:";
const IV_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;

function deriveKey(secretKey: string): Buffer {
  return createHash("sha256").update(secretKey, "utf8").digest();
}

export class SecretManager {
  private readonly key: Buffer;

  constructor(secretKey: string) {
    this.key = deriveKey(secretKey);
  }

  encrypt(value: string): string {
    const iv = randomBytes(IV_LENGTH_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const payload = Buffer.concat([iv, authTag, ciphertext]);
    return `${ENCRYPTED_VALUE_PREFIX}${payload.toString("base64url")}`;
  }

  decrypt(value: string): string {
    if (!value.startsWith(ENCRYPTED_VALUE_PREFIX)) {
      throw new Error("Value is not in the expected aesgcm: encrypted format.");
    }
    const payload = Buffer.from(value.slice(ENCRYPTED_VALUE_PREFIX.length), "base64url");
    const iv = payload.subarray(0, IV_LENGTH_BYTES);
    const authTag = payload.subarray(IV_LENGTH_BYTES, IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);
    const ciphertext = payload.subarray(IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);

    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString("utf8");
  }
}

let cached: SecretManager | null = null;

export function getSecretManager(): SecretManager {
  if (!cached) {
    cached = new SecretManager(getConfig().providerSecretKey);
  }
  return cached;
}

export function __resetSecretManagerForTests(): void {
  cached = null;
}
