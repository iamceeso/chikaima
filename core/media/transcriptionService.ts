import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";

import { eq, and, inArray } from "drizzle-orm";

import { getSecretManager } from "../crypto/index.js";
import type { ChikaimaDatabase } from "../db/client.js";
import { providers } from "../db/schema.js";
import { AssetProcessingError } from "../documents/types.js";
import { WorkspaceService } from "../auth/workspaceService.js";

const OPENAI_COMPATIBLE_PROVIDER_TYPES = ["openai", "litellm", "local"] as const;
const OPENAI_COMPATIBLE_PROVIDER_PRIORITY: Record<string, number> = { openai: 0, litellm: 1, local: 2 };
const DEFAULT_TRANSCRIPTION_MODEL = "gpt-4o-transcribe";
const MAX_TRANSCRIPTION_FILE_BYTES = 25 * 1024 * 1024;

const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  litellm: "http://localhost:4000/v1",
  local: "http://localhost:4000/v1",
};

type ProviderRow = typeof providers.$inferSelect;

const MIME_TYPES_BY_EXTENSION: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".wav": "audio/wav",
  ".webm": "video/webm",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
};

function guessMimeType(fileName: string): string {
  return MIME_TYPES_BY_EXTENSION[extname(fileName).toLowerCase()] ?? "application/octet-stream";
}

export class TranscriptionProviderService {
  constructor(private readonly db: ChikaimaDatabase) {}

  async transcribeMedia(userId: string, filePath: string, sourceName: string, mimeType?: string | null): Promise<string> {
    let sizeBytes: number;
    try {
      sizeBytes = (await stat(filePath)).size;
    } catch {
      throw new AssetProcessingError(`${sourceName} could not be read for transcription.`);
    }

    if (sizeBytes > MAX_TRANSCRIPTION_FILE_BYTES) {
      const sizeMb = Math.floor(sizeBytes / (1024 * 1024));
      throw new AssetProcessingError(`${sourceName} is ${sizeMb} MB, but direct transcription currently supports files up to 25 MB.`);
    }

    const candidateProviders = this.listTranscriptionProviders(userId);
    if (candidateProviders.length === 0) {
      throw new AssetProcessingError(
        "No supported transcription provider is enabled. Add an OpenAI, LiteLLM, or local OpenAI-compatible provider to transcribe audio or video files.",
      );
    }

    const errors: string[] = [];
    for (const provider of candidateProviders) {
      try {
        return (await this.transcribeWithProvider(provider, filePath, sourceName, mimeType)).trim();
      } catch (error) {
        errors.push(`${provider.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    throw new AssetProcessingError(errors[errors.length - 1] ?? `Transcription failed for ${sourceName}.`);
  }

  private listTranscriptionProviders(userId: string): ProviderRow[] {
    const workspace = new WorkspaceService(this.db).getOrCreate();
    let rows = this.db
      .select()
      .from(providers)
      .where(and(eq(providers.isEnabled, true), inArray(providers.providerType, [...OPENAI_COMPATIBLE_PROVIDER_TYPES])))
      .all();

    if (workspace.authenticationEnabled) {
      rows = rows.filter((provider) => provider.userId === userId);
    }
    rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    rows.sort((a, b) => (OPENAI_COMPATIBLE_PROVIDER_PRIORITY[a.providerType] ?? 100) - (OPENAI_COMPATIBLE_PROVIDER_PRIORITY[b.providerType] ?? 100));
    return rows;
  }

  private async transcribeWithProvider(provider: ProviderRow, filePath: string, sourceName: string, mimeType?: string | null): Promise<string> {
    const config = provider.encryptedConfig as Record<string, unknown>;
    const encryptedApiKey = config.api_key;
    if (provider.providerType !== "local" && typeof encryptedApiKey !== "string") {
      throw new AssetProcessingError(`${provider.name} is missing an API key.`);
    }
    const apiKey = typeof encryptedApiKey === "string" ? getSecretManager().decrypt(encryptedApiKey) : "";
    const baseUrl = (provider.baseUrl || DEFAULT_BASE_URLS[provider.providerType] || "").replace(/\/+$/, "");
    const contentType = mimeType || guessMimeType(filePath);

    const fileBytes = await readFile(filePath);
    const formData = new FormData();
    formData.append("model", DEFAULT_TRANSCRIPTION_MODEL);
    formData.append("file", new Blob([new Uint8Array(fileBytes)], { type: contentType }), basename(sourceName) || basename(filePath));

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/audio/transcriptions`, {
        method: "POST",
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        body: formData,
      });
    } catch {
      throw new AssetProcessingError("Could not reach the transcription provider.");
    }

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).trim();
      throw new AssetProcessingError(detail || "Transcription request failed.");
    }

    const payload = (await response.json()) as { text?: unknown };
    return typeof payload.text === "string" ? payload.text.trim() : "";
  }
}
