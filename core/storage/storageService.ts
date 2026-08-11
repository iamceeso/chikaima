import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";

import { getConfig } from "../config/index.js";
import { badRequest, payloadTooLarge } from "../errors.js";

export interface SavedUpload {
  name: string;
  filePath: string;
  contentType: string;
  sizeBytes: number;
}

export interface SaveUploadOptions {
  allowedContentTypes: Set<string>;
  maxSizeBytes: number;
}

/** Keep uploaded filenames filesystem-safe while preserving a readable suffix. */
function sanitizeFilename(name: string): string {
  const sanitized = name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return sanitized || "upload";
}

export class StorageService {
  private readonly root: string;

  constructor() {
    this.root = resolve(getConfig().mediaRoot);
  }

  async saveUpload(file: File, category: string, options: SaveUploadOptions): Promise<SavedUpload> {
    const contentType = file.type || "application/octet-stream";
    if (!options.allowedContentTypes.has(contentType)) {
      throw badRequest(`Unsupported file type: ${contentType}`);
    }

    const originalName = file.name || `${category}-upload`;
    const safeName = sanitizeFilename(originalName);
    const targetDir = join(this.root, category);
    await mkdir(targetDir, { recursive: true });
    const targetPath = join(targetDir, `${randomUUID()}-${safeName}`);

    let size = 0;
    const writeStream = createWriteStream(targetPath);
    const nodeStream = Readable.fromWeb(file.stream() as never);

    try {
      for await (const chunk of nodeStream) {
        size += chunk.length;
        if (size > options.maxSizeBytes) {
          writeStream.destroy();
          await unlink(targetPath).catch(() => undefined);
          const limitMb = Math.floor(options.maxSizeBytes / (1024 * 1024));
          throw payloadTooLarge(`Uploaded file exceeds the configured size limit of ${limitMb} MB.`);
        }
        if (!writeStream.write(chunk)) {
          await new Promise<void>((resolveDrain) => writeStream.once("drain", () => resolveDrain()));
        }
      }
      writeStream.end();
      await finished(writeStream);
    } catch (error) {
      writeStream.destroy();
      await unlink(targetPath).catch(() => undefined);
      throw error;
    }

    return { name: originalName, filePath: targetPath, contentType, sizeBytes: size };
  }

  async deleteFile(filePath: string | null | undefined): Promise<void> {
    if (!filePath) return;
    await unlink(filePath).catch(() => undefined);
  }
}

export const storageService = new StorageService();
