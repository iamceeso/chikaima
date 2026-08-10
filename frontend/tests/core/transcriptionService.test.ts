import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AuthService } from "../../core/auth/authService.js";
import { __resetConfigForTests } from "../../core/config/index.js";
import { __resetSecretManagerForTests } from "../../core/crypto/index.js";
import { getDb, __resetDbForTests } from "../../core/db/client.js";
import { AssetProcessingError } from "../../core/documents/types.js";
import { TranscriptionProviderService } from "../../core/media/transcriptionService.js";
import { ProviderService } from "../../core/providers/providerService.js";

async function withTempDb<T>(fn: (workDir: string) => T | Promise<T>): Promise<T> {
  const dbDir = mkdtempSync(join(tmpdir(), "chikaima-transcribe-db-"));
  const workDir = mkdtempSync(join(tmpdir(), "chikaima-transcribe-work-"));
  const previous = process.env.CHIKAIMA_DB_PATH;
  process.env.CHIKAIMA_DB_PATH = join(dbDir, "test.db");
  __resetConfigForTests();
  __resetDbForTests();
  __resetSecretManagerForTests();
  try {
    return await fn(workDir);
  } finally {
    __resetDbForTests();
    __resetConfigForTests();
    __resetSecretManagerForTests();
    if (previous === undefined) delete process.env.CHIKAIMA_DB_PATH;
    else process.env.CHIKAIMA_DB_PATH = previous;
    rmSync(dbDir, { recursive: true, force: true });
    rmSync(workDir, { recursive: true, force: true });
  }
}

async function withMockedFetch<T>(handler: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

test("transcribeMedia raises AssetProcessingError when no provider is configured", async () => {
  await withTempDb(async (workDir) => {
    const db = getDb();
    const authService = new AuthService(db);
    const user = authService.register({ email: "user@example.com", fullName: "User", password: "password123" });

    const filePath = join(workDir, "clip.mp3");
    writeFileSync(filePath, "fake audio bytes");

    await assert.rejects(
      () => new TranscriptionProviderService(db).transcribeMedia(user.id, filePath, "clip.mp3"),
      AssetProcessingError,
    );
  });
});

test("transcribeMedia posts the file as multipart form data and returns the transcript text", async () => {
  await withTempDb(async (workDir) => {
    const db = getDb();
    const authService = new AuthService(db);
    const user = authService.register({ email: "user@example.com", fullName: "User", password: "password123" });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("unauthorized", { status: 401 })) as typeof fetch;
    try {
      await new ProviderService(db).create(user.id, { name: "My OpenAI", providerType: "openai", apiKey: "sk-test" });
    } finally {
      globalThis.fetch = originalFetch;
    }

    const filePath = join(workDir, "clip.mp3");
    writeFileSync(filePath, "fake audio bytes");

    let capturedForm: FormData | null = null;
    let capturedHeaders: Headers | null = null;

    const transcript = await withMockedFetch(
      (async (_url, init) => {
        capturedForm = init?.body as FormData;
        capturedHeaders = new Headers(init?.headers);
        return new Response(JSON.stringify({ text: "hello from the transcript" }), { status: 200 });
      }) as typeof fetch,
      () => new TranscriptionProviderService(db).transcribeMedia(user.id, filePath, "clip.mp3", "audio/mpeg"),
    );

    assert.equal(transcript, "hello from the transcript");
    assert.equal(capturedHeaders!.get("authorization"), "Bearer sk-test");
    assert.equal(capturedForm!.get("model"), "gpt-4o-transcribe");
    const file = capturedForm!.get("file") as unknown as File;
    assert.equal(file.name, "clip.mp3");
  });
});

test("transcribeMedia rejects files over the 25MB direct-transcription limit before making a request", async () => {
  await withTempDb(async (workDir) => {
    const db = getDb();
    const authService = new AuthService(db);
    const user = authService.register({ email: "user@example.com", fullName: "User", password: "password123" });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("unauthorized", { status: 401 })) as typeof fetch;
    try {
      await new ProviderService(db).create(user.id, { name: "My OpenAI", providerType: "openai", apiKey: "sk-test" });
    } finally {
      globalThis.fetch = originalFetch;
    }

    const filePath = join(workDir, "big.mp3");
    writeFileSync(filePath, Buffer.alloc(26 * 1024 * 1024));

    let fetchCalled = false;
    await assert.rejects(
      () =>
        withMockedFetch(
          (async () => {
            fetchCalled = true;
            return new Response("{}", { status: 200 });
          }) as typeof fetch,
          () => new TranscriptionProviderService(db).transcribeMedia(user.id, filePath, "big.mp3"),
        ),
      AssetProcessingError,
    );
    assert.equal(fetchCalled, false);
  });
});
