import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { getSecretManager } from "../crypto/index.js";
import type { ChikaimaDatabase } from "../db/client.js";
import { aiModels, conversations, providers } from "../db/schema.js";
import { notFound } from "../errors.js";
import {
  CURATED_PROVIDER_MODELS,
  dedupeModels,
  geminiCapabilities,
  isDeprecatedModel,
  joinApiUrl,
  openaiCapabilities,
  resolveBaseUrl,
  shouldIncludeOpenaiModel,
  shouldIncludeOpenrouterModel,
  sortModels,
  titleizeModelName,
  type CuratedModel,
} from "./catalog.js";
import { ProviderRepository, type ProviderRow } from "./repository.js";

export type ProviderType = "openai" | "anthropic" | "gemini" | "ollama" | "openrouter" | "litellm" | "local";

export interface ProviderCreateInput {
  name: string;
  providerType: ProviderType;
  baseUrl?: string | null;
  apiKey?: string | null;
  config?: Record<string, unknown>;
}

export interface ProviderUpdateInput {
  name?: string | null;
  baseUrl?: string | null;
  isEnabled?: boolean | null;
  apiKey?: string | null;
  config?: Record<string, unknown> | null;
}

export interface ProviderResponse {
  id: string;
  name: string;
  provider_type: string;
  base_url: string | null;
  is_enabled: boolean;
  masked_secret: string | null;
  created_at: string;
  updated_at: string;
}

export interface AIModelResponse {
  id: string;
  provider_id: string;
  provider_name?: string | null;
  provider_type?: string | null;
  model_key: string;
  display_name: string;
  capabilities: Record<string, boolean>;
  is_default: boolean;
  is_available: boolean;
  is_deprecated: boolean;
  created_at: string;
  updated_at: string;
}

type AIModelRow = typeof aiModels.$inferSelect;

export function maskSecret(secret: string | null | undefined): string | null {
  return secret ? "**********" : null;
}

export function toProviderResponse(provider: ProviderRow): ProviderResponse {
  const config = provider.encryptedConfig as Record<string, unknown>;
  return {
    id: provider.id,
    name: provider.name,
    provider_type: provider.providerType,
    base_url: provider.baseUrl,
    is_enabled: provider.isEnabled,
    masked_secret: maskSecret(typeof config?.api_key === "string" ? config.api_key : null),
    created_at: provider.createdAt,
    updated_at: provider.updatedAt,
  };
}

export function buildModelResponse(model: AIModelRow, provider: ProviderRow): AIModelResponse {
  return {
    id: model.id,
    provider_id: model.providerId,
    provider_name: provider.name,
    provider_type: provider.providerType,
    model_key: model.modelKey,
    display_name: model.displayName,
    capabilities: model.capabilities as Record<string, boolean>,
    is_default: model.isDefault,
    is_available: model.isAvailable,
    is_deprecated: isDeprecatedModel(provider.providerType, model.modelKey),
    created_at: model.createdAt,
    updated_at: model.updatedAt,
  };
}

export class ProviderService {
  private readonly providerRepo: ProviderRepository;

  constructor(private readonly db: ChikaimaDatabase) {
    this.providerRepo = new ProviderRepository(db);
  }

  listForUser(userId: string): ProviderRow[] {
    return this.providerRepo.listForUser(userId);
  }

  async create(userId: string, payload: ProviderCreateInput): Promise<ProviderRow> {
    const encryptedConfig: Record<string, unknown> = { ...(payload.config ?? {}) };
    if (payload.apiKey) {
      encryptedConfig.api_key = getSecretManager().encrypt(payload.apiKey);
    }

    const now = new Date().toISOString();
    const row: ProviderRow = {
      id: randomUUID(),
      userId,
      name: payload.name,
      providerType: payload.providerType,
      baseUrl: payload.baseUrl ?? null,
      encryptedConfig,
      isEnabled: true,
      createdAt: now,
      updatedAt: now,
    };
    this.db.insert(providers).values(row).run();

    const syncedModels = await this.loadProviderModels(row, payload.apiKey ?? undefined);
    this.replaceProviderModels(row, syncedModels);

    return this.providerRepo.get(row.id)!;
  }

  async update(userId: string, providerId: string, payload: ProviderUpdateInput): Promise<ProviderRow> {
    const provider = this.requireOwned(userId, providerId);

    const nextConfig: Record<string, unknown> = { ...(provider.encryptedConfig as Record<string, unknown>) };
    if (payload.config) {
      Object.assign(nextConfig, payload.config);
    }
    if (payload.apiKey) {
      nextConfig.api_key = getSecretManager().encrypt(payload.apiKey);
    }

    this.db
      .update(providers)
      .set({
        name: payload.name ?? provider.name,
        baseUrl: payload.baseUrl !== undefined ? payload.baseUrl : provider.baseUrl,
        isEnabled: payload.isEnabled ?? provider.isEnabled,
        encryptedConfig: nextConfig,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(providers.id, providerId))
      .run();

    let updated = this.providerRepo.get(providerId)!;

    if (payload.apiKey !== undefined || payload.baseUrl !== undefined || payload.config !== undefined) {
      const syncedModels = await this.loadProviderModels(updated, payload.apiKey ?? undefined);
      this.replaceProviderModels(updated, syncedModels);
      updated = this.providerRepo.get(providerId)!;
    }

    return updated;
  }

  async resyncModels(userId: string, providerId: string): Promise<ProviderRow> {
    const provider = this.requireOwned(userId, providerId);
    const syncedModels = await this.loadProviderModels(provider);
    this.replaceProviderModels(provider, syncedModels);
    return this.providerRepo.get(providerId)!;
  }

  delete(userId: string, providerId: string): void {
    const provider = this.requireOwned(userId, providerId);
    this.providerRepo.delete(provider);
  }

  private requireOwned(userId: string, providerId: string): ProviderRow {
    const provider = this.providerRepo.get(providerId);
    if (!provider || provider.userId !== userId) {
      throw notFound("Provider not found");
    }
    return provider;
  }

  private replaceProviderModels(provider: ProviderRow, models: CuratedModel[]): void {
    const syncedModels = sortModels(provider.providerType, dedupeModels(models).length > 0 ? dedupeModels(models) : CURATED_PROVIDER_MODELS[provider.providerType] ?? []);

    const existingModels = this.db.select().from(aiModels).where(eq(aiModels.providerId, provider.id)).all();
    const existingByKey = new Map(existingModels.map((model) => [model.modelKey, model]));
    let existingDefault = existingModels.find((model) => model.isDefault) ?? null;
    const hasGlobalDefaultElsewhere =
      this.db
        .select({ id: aiModels.id })
        .from(aiModels)
        .where(eq(aiModels.isDefault, true))
        .all()
        .filter((row) => !existingModels.some((existing) => existing.id === row.id)).length > 0;

    const now = new Date().toISOString();
    syncedModels.forEach((model, index) => {
      const existing = existingByKey.get(model.key);
      if (existing) {
        this.db
          .update(aiModels)
          .set({ displayName: model.name, capabilities: model.capabilities, updatedAt: now })
          .where(eq(aiModels.id, existing.id))
          .run();
        return;
      }

      const shouldBeDefault = index === 0 && existingDefault === null && !hasGlobalDefaultElsewhere;
      const newRow: AIModelRow = {
        id: randomUUID(),
        providerId: provider.id,
        modelKey: model.key,
        displayName: model.name,
        capabilities: model.capabilities,
        isDefault: shouldBeDefault,
        isAvailable: true,
        createdAt: now,
        updatedAt: now,
      };
      this.db.insert(aiModels).values(newRow).run();
      existingByKey.set(model.key, newRow);
      if (shouldBeDefault) existingDefault = newRow;
    });

    const syncedKeys = new Set(syncedModels.map((model) => model.key));
    for (const existing of existingModels) {
      if (syncedKeys.has(existing.modelKey)) continue;

      const isReferenced = this.db.select({ id: conversations.id }).from(conversations).where(eq(conversations.modelId, existing.id)).get() !== undefined;
      if (isReferenced || existing.isDefault) {
        this.db.update(aiModels).set({ isAvailable: false, updatedAt: now }).where(eq(aiModels.id, existing.id)).run();
        continue;
      }

      this.db.delete(aiModels).where(eq(aiModels.id, existing.id)).run();
    }
  }

  private async loadProviderModels(provider: ProviderRow, apiKey?: string): Promise<CuratedModel[]> {
    let resolvedApiKey = apiKey;
    if (!resolvedApiKey) {
      const config = provider.encryptedConfig as Record<string, unknown>;
      const encryptedApiKey = config.api_key;
      if (typeof encryptedApiKey === "string") {
        resolvedApiKey = getSecretManager().decrypt(encryptedApiKey);
        const reEncrypted = { ...config, api_key: getSecretManager().encrypt(resolvedApiKey) };
        this.db.update(providers).set({ encryptedConfig: reEncrypted }).where(eq(providers.id, provider.id)).run();
      }
    }

    switch (provider.providerType) {
      case "openai":
        return this.fetchOpenaiModels(provider, resolvedApiKey);
      case "anthropic":
        return this.fetchAnthropicModels(provider, resolvedApiKey);
      case "gemini":
        return this.fetchGeminiModels(provider, resolvedApiKey);
      case "ollama":
        return this.fetchOllamaModels(provider);
      case "openrouter":
      case "litellm":
      case "local":
        return this.fetchOpenaiModels(provider, resolvedApiKey);
      default:
        return CURATED_PROVIDER_MODELS[provider.providerType] ?? [];
    }
  }

  private async fetchOpenaiModels(provider: ProviderRow, apiKey?: string): Promise<CuratedModel[]> {
    const fallbackKey = provider.providerType in CURATED_PROVIDER_MODELS ? provider.providerType : "openai";
    const fallback = CURATED_PROVIDER_MODELS[provider.providerType === "openai" ? "openai" : fallbackKey] ?? [];

    if (!apiKey && provider.providerType !== "local") {
      return fallback;
    }
    const baseUrl = resolveBaseUrl(provider.providerType, provider.baseUrl);
    if (!baseUrl) return fallback;

    let response: Response;
    try {
      response = await fetch(joinApiUrl(baseUrl, "models"), {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        signal: AbortSignal.timeout(12_000),
      });
    } catch {
      return fallback;
    }
    if (!response.ok) return fallback;

    const payload = (await response.json()) as { data?: Array<{ id?: unknown }> };
    const data = payload.data ?? [];
    const includeFilter = provider.providerType === "openrouter" || provider.providerType === "local" ? shouldIncludeOpenrouterModel : shouldIncludeOpenaiModel;

    const models = data
      .filter((item): item is { id: string } => typeof item.id === "string" && includeFilter(item.id))
      .map((item) => ({ key: item.id, name: item.id, capabilities: openaiCapabilities(item.id) }));

    return models.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  }

  private async fetchAnthropicModels(provider: ProviderRow, apiKey?: string): Promise<CuratedModel[]> {
    const fallback = CURATED_PROVIDER_MODELS.anthropic ?? [];
    if (!apiKey) return fallback;
    const baseUrl = resolveBaseUrl(provider.providerType, provider.baseUrl);
    if (!baseUrl) return fallback;

    let response: Response;
    try {
      response = await fetch(joinApiUrl(baseUrl, "v1/models"), {
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        signal: AbortSignal.timeout(12_000),
      });
    } catch {
      return fallback;
    }
    if (!response.ok) return fallback;

    const payload = (await response.json()) as { data?: Array<{ id?: unknown; display_name?: unknown }> };
    const data = payload.data ?? [];
    const models = data
      .filter((item): item is { id: string; display_name?: string } => typeof item.id === "string")
      .map((item) => ({
        key: item.id,
        name: item.display_name || titleizeModelName(item.id),
        capabilities: { chat: true, vision: true },
      }));

    return models.length > 0 ? models : fallback;
  }

  private async fetchGeminiModels(provider: ProviderRow, apiKey?: string): Promise<CuratedModel[]> {
    const fallback = CURATED_PROVIDER_MODELS.gemini ?? [];
    if (!apiKey) return fallback;
    const baseUrl = resolveBaseUrl(provider.providerType, provider.baseUrl);
    if (!baseUrl) return fallback;

    let response: Response;
    try {
      response = await fetch(`${joinApiUrl(baseUrl, "models")}?key=${encodeURIComponent(apiKey)}`, {
        signal: AbortSignal.timeout(12_000),
      });
    } catch {
      return fallback;
    }
    if (!response.ok) return fallback;

    const payload = (await response.json()) as {
      models?: Array<{ name?: unknown; supportedGenerationMethods?: unknown; displayName?: unknown }>;
    };
    const data = payload.models ?? [];
    const models: CuratedModel[] = [];
    for (const item of data) {
      const name = item.name;
      const methods = item.supportedGenerationMethods;
      if (typeof name !== "string" || !Array.isArray(methods)) continue;
      if (!methods.includes("generateContent")) continue;

      const modelKey = name.replace(/^models\//, "");
      if (modelKey.toLowerCase().includes("embedding")) continue;
      models.push({
        key: modelKey,
        name: typeof item.displayName === "string" ? item.displayName : titleizeModelName(modelKey),
        capabilities: geminiCapabilities(modelKey),
      });
    }

    return models.length > 0 ? models : fallback;
  }

  private async fetchOllamaModels(provider: ProviderRow): Promise<CuratedModel[]> {
    const fallback = CURATED_PROVIDER_MODELS.ollama ?? [];
    const baseUrl = resolveBaseUrl(provider.providerType, provider.baseUrl);
    if (!baseUrl) return fallback;

    let response: Response;
    try {
      response = await fetch(joinApiUrl(baseUrl, "api/tags"), { signal: AbortSignal.timeout(8_000) });
    } catch {
      return fallback;
    }
    if (!response.ok) return fallback;

    const payload = (await response.json()) as { models?: Array<{ model?: unknown; name?: unknown }> };
    const data = payload.models ?? [];
    const models = data
      .filter((item): item is { model: string; name?: string } => typeof item.model === "string")
      .map((item) => ({ key: item.model, name: item.name || item.model, capabilities: { chat: true, local: true } }));

    return models.length > 0 ? models : fallback;
  }
}
