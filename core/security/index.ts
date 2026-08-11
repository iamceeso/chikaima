import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

import { SignJWT, jwtVerify, type JWTPayload } from "jose";

import { getConfig } from "../config/index.js";

/**
 * PBKDF2-HMAC-SHA256 password hashing via Node's built-in crypto, same
 * algorithm family as the Python backend's passlib pbkdf2_sha256 scheme but
 * NOT byte-compatible with it (passlib uses its own base64 alphabet and a
 * `$pbkdf2-sha256$...` MCF-style format string). There is no Postgres->SQLite
 * user-data migration in Phase 1 (schema only, per the audit), so no existing
 * password hashes need to verify against this — this is a self-contained
 * scheme for accounts created against the new SQLite store.
 * Format: pbkdf2_sha256$<iterations>$<salt-b64>$<hash-b64>
 */
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEYLEN = 32;
const PBKDF2_DIGEST = "sha256";

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST);
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export function verifyPassword(plainPassword: string, hashedPassword: string): boolean {
  const parts = hashedPassword.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") {
    return false;
  }
  const [, iterationsRaw, saltB64, hashB64] = parts;
  const iterations = Number.parseInt(iterationsRaw ?? "", 10);
  if (!Number.isFinite(iterations) || iterations <= 0) {
    return false;
  }

  const salt = Buffer.from(saltB64 ?? "", "base64");
  const expected = Buffer.from(hashB64 ?? "", "base64");
  const actual = pbkdf2Sync(plainPassword, salt, iterations, expected.length, PBKDF2_DIGEST);

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export type TokenType = "access" | "refresh" | "password_reset";

async function signToken(subject: string, type: TokenType, secret: string, expiresInSeconds: number): Promise<string> {
  return new SignJWT({ type })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds)
    .sign(new TextEncoder().encode(secret));
}

export function createAccessToken(subject: string, expiresInSeconds?: number): Promise<string> {
  const config = getConfig();
  return signToken(subject, "access", config.jwtSecretKey, expiresInSeconds ?? config.accessTokenExpireMinutes * 60);
}

export function createRefreshToken(subject: string, expiresInSeconds?: number): Promise<string> {
  const config = getConfig();
  return signToken(subject, "refresh", config.jwtRefreshSecretKey, expiresInSeconds ?? config.refreshTokenExpireDays * 24 * 60 * 60);
}

const PASSWORD_RESET_TOKEN_EXPIRE_SECONDS = 30 * 60;

export function createPasswordResetToken(subject: string, expiresInSeconds?: number): Promise<string> {
  const config = getConfig();
  return signToken(subject, "password_reset", config.jwtSecretKey, expiresInSeconds ?? PASSWORD_RESET_TOKEN_EXPIRE_SECONDS);
}

export interface DecodedToken extends JWTPayload {
  sub: string;
  type: TokenType;
}

export class InvalidTokenError extends Error {}

export async function decodeToken(token: string, options: { refresh?: boolean; expectedType?: TokenType } = {}): Promise<DecodedToken> {
  const config = getConfig();
  const secret = options.refresh ? config.jwtRefreshSecretKey : config.jwtSecretKey;

  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, new TextEncoder().encode(secret)));
  } catch (error) {
    throw new InvalidTokenError(error instanceof Error ? error.message : "Invalid token");
  }

  const type = payload.type as TokenType | undefined;
  if (options.expectedType && type !== options.expectedType) {
    throw new InvalidTokenError(`Invalid token type: expected ${options.expectedType}, got ${type}`);
  }
  if (!payload.sub) {
    throw new InvalidTokenError("Token is missing a subject");
  }

  return payload as DecodedToken;
}
