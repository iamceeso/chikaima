import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { __resetConfigForTests } from "../../core/config/index.js";
import { StorageService } from "../../core/storage/storageService.js";
import { HttpError } from "../../core/errors.js";

async function withTempMediaRoot<T>(fn: () => T | Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "chikaima-storage-test-"));
  const previous = process.env.CHIKAIMA_MEDIA_ROOT;
  process.env.CHIKAIMA_MEDIA_ROOT = dir;
  __resetConfigForTests();
  try {
    return await fn();
  } finally {
    __resetConfigForTests();
    if (previous === undefined) delete process.env.CHIKAIMA_MEDIA_ROOT;
    else process.env.CHIKAIMA_MEDIA_ROOT = previous;
    rmSync(dir, { recursive: true, force: true });
  }
}

test("saveUpload writes the file to disk under the category directory with a sanitized, unique name", async () => {
  await withTempMediaRoot(async () => {
    const service = new StorageService();
    const file = new File(["hello world"], "my file!.txt", { type: "text/plain" });

    const saved = await service.saveUpload(file, "documents", { allowedContentTypes: new Set(["text/plain"]), maxSizeBytes: 1024 });

    assert.equal(saved.name, "my file!.txt");
    assert.equal(saved.contentType, "text/plain");
    assert.equal(saved.sizeBytes, 11);
    assert.ok(existsSync(saved.filePath));
    assert.equal(readFileSync(saved.filePath, "utf8"), "hello world");
    assert.match(saved.filePath, /documents[/\\][0-9a-f-]+-my-file-.txt$/);
  });
});

test("saveUpload rejects a disallowed content type before touching disk", async () => {
  await withTempMediaRoot(async () => {
    const service = new StorageService();
    const file = new File(["data"], "malware.exe", { type: "application/x-msdownload" });

    await assert.rejects(
      () => service.saveUpload(file, "documents", { allowedContentTypes: new Set(["text/plain"]), maxSizeBytes: 1024 }),
      (error: unknown) => error instanceof HttpError && error.statusCode === 400,
    );
  });
});

test("saveUpload rejects and cleans up a file that exceeds the configured size limit", async () => {
  await withTempMediaRoot(async () => {
    const service = new StorageService();
    const oversized = "x".repeat(2048);
    const file = new File([oversized], "big.txt", { type: "text/plain" });

    await assert.rejects(
      () => service.saveUpload(file, "documents", { allowedContentTypes: new Set(["text/plain"]), maxSizeBytes: 1024 }),
      (error: unknown) => error instanceof HttpError && error.statusCode === 413,
    );
  });
});

test("deleteFile silently no-ops for a missing path or file", async () => {
  await withTempMediaRoot(async () => {
    const service = new StorageService();
    await assert.doesNotReject(() => service.deleteFile(null));
    await assert.doesNotReject(() => service.deleteFile("/nonexistent/path/file.txt"));
  });
});
