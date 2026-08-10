import { and, eq, inArray } from "drizzle-orm";

import { WorkspaceService } from "../auth/workspaceService.js";
import { getConfig } from "../config/index.js";
import { getSecretManager } from "../crypto/index.js";
import type { ChikaimaDatabase } from "../db/client.js";
import { providers } from "../db/schema.js";
import { VectorStore, type StoredChunk } from "../rag/vectorStore.js";

const OPENAI_COMPATIBLE_PROVIDER_TYPES = ["openai", "openrouter", "litellm", "local"] as const;
const SUPPORTED_EMBEDDING_PROVIDER_TYPES = [...OPENAI_COMPATIBLE_PROVIDER_TYPES, "gemini", "ollama"] as const;
const EMBEDDING_PROVIDER_PRIORITY: Record<string, number> = { openai: 0, openrouter: 1, gemini: 2, ollama: 3, litellm: 4 };

const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  litellm: "http://localhost:4000/v1",
  local: "http://localhost:4000/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
  ollama: "http://localhost:11434",
};

const DEFAULT_EMBEDDING_MODELS: Record<string, string> = {
  openai: "text-embedding-3-small",
  openrouter: "openai/text-embedding-3-small",
  litellm: "text-embedding-3-small",
  local: "text-embedding-3-small",
  gemini: "text-embedding-004",
  ollama: "nomic-embed-text",
};

type ProviderRow = typeof providers.$inferSelect;

export class EmbeddingProviderError extends Error {}
export class NoEmbeddingProviderError extends EmbeddingProviderError {}

export class EmbeddingsService {
  private readonly vectorStore: VectorStore;

  constructor(private readonly db: ChikaimaDatabase) {
    this.vectorStore = new VectorStore(db);
  }

  async generateEmbedding(userId: string, text: string): Promise<number[]> {
    const candidateProviders = this.listEmbeddingProviders(userId);
    if (candidateProviders.length === 0) {
      throw new NoEmbeddingProviderError(
        "No supported embedding provider is enabled. Add an OpenAI, Gemini, Ollama, OpenRouter, LiteLLM, or local OpenAI-compatible provider to enable retrieval.",
      );
    }
    return this.generateEmbeddingWithProviders(candidateProviders, text);
  }

  async replaceChunksForSource(params: {
    userId: string;
    sourceType: string;
    sourceId: string;
    assetType: string;
    filename: string;
    chunks: Array<{ content: string; metadata: Record<string, unknown> }>;
  }): Promise<StoredChunk[]> {
    this.vectorStore.deleteBySource(params.userId, params.sourceType, params.sourceId);

    const candidateProviders = this.listEmbeddingProviders(params.userId);
    if (candidateProviders.length === 0) {
      return [];
    }

    const prepared: Array<{ content: string; metadata: Record<string, unknown>; embedding: number[] }> = [];
    try {
      for (let index = 0; index < params.chunks.length; index += 1) {
        const normalized = params.chunks[index]!.content.trim();
        if (!normalized) continue;

        const payload: Record<string, unknown> = {
          chunk_index: index,
          source_type: params.sourceType,
          source_id: params.sourceId,
          asset_type: params.assetType,
          filename: params.filename,
          ...params.chunks[index]!.metadata,
        };
        const embedding = await this.generateEmbeddingWithProviders(candidateProviders, normalized);
        prepared.push({ content: normalized, metadata: payload, embedding });
      }
    } catch (error) {
      if (error instanceof EmbeddingProviderError) {
        return [];
      }
      throw error;
    }

    if (prepared.length === 0) return [];

    return this.vectorStore.insertChunks({
      userId: params.userId,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      assetType: params.assetType,
      filename: params.filename,
      chunks: prepared,
    });
  }

  deleteChunksForSource(userId: string, sourceType: string, sourceId: string): number {
    return this.vectorStore.deleteBySource(userId, sourceType, sourceId);
  }

  private listEmbeddingProviders(userId: string): ProviderRow[] {
    const workspace = new WorkspaceService(this.db).getOrCreate();
    let rows = this.db
      .select()
      .from(providers)
      .where(and(eq(providers.isEnabled, true), inArray(providers.providerType, [...SUPPORTED_EMBEDDING_PROVIDER_TYPES])))
      .all();

    if (workspace.authenticationEnabled) {
      rows = rows.filter((provider) => provider.userId === userId);
    }
    rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    rows.sort((a, b) => (EMBEDDING_PROVIDER_PRIORITY[a.providerType] ?? 100) - (EMBEDDING_PROVIDER_PRIORITY[b.providerType] ?? 100));
    return rows;
  }

  private async generateEmbeddingWithProviders(candidateProviders: ProviderRow[], text: string): Promise<number[]> {
    const errors: string[] = [];
    for (const provider of candidateProviders) {
      try {
        const vector = await this.embedWithProvider(provider, text || " ");
        return this.coerceEmbeddingDimension(vector);
      } catch (error) {
        if (error instanceof EmbeddingProviderError) {
          errors.push(`${provider.name}: ${error.message}`);
        } else {
          throw error;
        }
      }
    }
    throw new EmbeddingProviderError(errors[errors.length - 1] ?? "Embedding generation failed.");
  }

  private async embedWithProvider(provider: ProviderRow, text: string): Promise<number[]> {
    if ((OPENAI_COMPATIBLE_PROVIDER_TYPES as readonly string[]).includes(provider.providerType)) {
      return this.embedWithOpenaiCompatible(provider, text);
    }
    if (provider.providerType === "gemini") {
      return this.embedWithGemini(provider, text);
    }
    if (provider.providerType === "ollama") {
      return this.embedWithOllama(provider, text);
    }
    throw new EmbeddingProviderError(`${provider.providerType} does not support embeddings.`);
  }

  private async embedWithOpenaiCompatible(provider: ProviderRow, text: string): Promise<number[]> {
    const config = provider.encryptedConfig as Record<string, unknown>;
    const encryptedApiKey = config.api_key;
    if (!["litellm", "local"].includes(provider.providerType) && typeof encryptedApiKey !== "string") {
      throw new EmbeddingProviderError(`${provider.name} is missing an API key.`);
    }
    const apiKey = typeof encryptedApiKey === "string" ? getSecretManager().decrypt(encryptedApiKey) : "";
    const baseUrl = (provider.baseUrl || DEFAULT_BASE_URLS[provider.providerType]!).replace(/\/+$/, "");

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const response = await this.postJson(`${baseUrl}/embeddings`, headers, {
      model: this.embeddingModelForProvider(provider),
      input: text || " ",
    });
    const data = (response.data as Array<{ embedding?: unknown }> | undefined) ?? [];
    if (data.length === 0) {
      throw new EmbeddingProviderError("The embedding provider returned no vectors.");
    }
    return this.parseEmbeddingValues(data[0]!.embedding);
  }

  private async embedWithGemini(provider: ProviderRow, text: string): Promise<number[]> {
    const config = provider.encryptedConfig as Record<string, unknown>;
    const encryptedApiKey = config.api_key;
    if (typeof encryptedApiKey !== "string") {
      throw new EmbeddingProviderError(`${provider.name} is missing an API key.`);
    }
    const apiKey = getSecretManager().decrypt(encryptedApiKey);
    const baseUrl = (provider.baseUrl || DEFAULT_BASE_URLS.gemini!).replace(/\/+$/, "");
    const model = this.embeddingModelForProvider(provider);
    const modelPath = model.startsWith("models/") ? model : `models/${model}`;

    const response = await this.postJson(`${baseUrl}/${modelPath}:embedContent?key=${encodeURIComponent(apiKey)}`, {}, { content: { parts: [{ text: text || " " }] } });
    const embedding = (response.embedding as { values?: unknown } | undefined) ?? {};
    return this.parseEmbeddingValues(embedding.values);
  }

  private async embedWithOllama(provider: ProviderRow, text: string): Promise<number[]> {
    const baseUrl = (provider.baseUrl || DEFAULT_BASE_URLS.ollama!).replace(/\/+$/, "");
    const response = await this.postJson(`${baseUrl}/api/embed`, {}, { model: this.embeddingModelForProvider(provider), input: text || " " });

    if (Array.isArray(response.embedding)) {
      return this.parseEmbeddingValues(response.embedding);
    }
    const embeddings = (response.embeddings as unknown[] | undefined) ?? [];
    if (embeddings.length > 0) {
      return this.parseEmbeddingValues(embeddings[0]);
    }
    throw new EmbeddingProviderError("The embedding provider returned no vectors.");
  }

  private async postJson(url: string, headers: Record<string, string>, body: unknown): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
    } catch {
      throw new EmbeddingProviderError("Could not reach the embedding provider.");
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).trim();
      throw new EmbeddingProviderError(detail || "Embedding request failed.");
    }
    return (await response.json()) as Record<string, unknown>;
  }

  private embeddingModelForProvider(provider: ProviderRow): string {
    const config = provider.encryptedConfig as Record<string, unknown>;
    const configured = config.embedding_model;
    if (typeof configured === "string" && configured.trim()) {
      return configured.trim();
    }
    return DEFAULT_EMBEDDING_MODELS[provider.providerType]!;
  }

  private parseEmbeddingValues(values: unknown): number[] {
    if (!Array.isArray(values)) {
      throw new EmbeddingProviderError("The embedding provider returned an invalid vector payload.");
    }
    const vector = values.filter((value): value is number => typeof value === "number").map((value) => Number(value));
    if (vector.length === 0) {
      throw new EmbeddingProviderError("The embedding provider returned an empty vector.");
    }
    return vector;
  }

  private coerceEmbeddingDimension(vector: number[]): number[] {
    const target = getConfig().embeddingDimension;
    if (vector.length === target) return vector;
    if (vector.length > target) return vector.slice(0, target);
    return [...vector, ...new Array(target - vector.length).fill(0)];
  }
}
