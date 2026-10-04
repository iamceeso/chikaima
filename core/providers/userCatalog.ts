import { readFileSync, statSync } from "node:fs";

import { z } from "zod";

import { getConfig } from "../config/index.js";
import { CURATED_PROVIDER_MODELS, dedupeModels, type CuratedModel } from "./catalog.js";

/**
 * A user-editable provider catalog: a JSON file (default `providers.json`
 * next to the database, or `CHIKAIMA_PROVIDER_CATALOG_PATH`) that adds
 * models to — or overrides models in — the built-in catalog, without a code
 * change or release. Shape:
 *
 *   {
 *     "models": {
 *       "anthropic": [
 *         { "key": "claude-new-model", "name": "Claude New", "capabilities": { "chat": true, "vision": true } }
 *       ]
 *     }
 *   }
 *
 * An entry whose key matches a built-in or provider-listed model replaces
 * it (so a wrong name or capability can be fixed locally); new keys are
 * added. Setting `"economy": true|false` in capabilities pins background
 * routing for that model.
 */
const userCatalogSchema = z.object({
  models: z
    .record(
      z.string(),
      z.array(
        z.object({
          key: z.string().min(1),
          name: z.string().optional(),
          capabilities: z.record(z.string(), z.boolean()).optional(),
        }),
      ),
    )
    .default({}),
});

type UserCatalog = Record<string, CuratedModel[]>;

let cache: { path: string; mtimeMs: number; catalog: UserCatalog } | null = null;

/** Reads the user catalog, re-parsing only when the file changes. A missing file is an empty catalog; an invalid one is logged and ignored rather than breaking provider sync. */
export function loadUserCatalog(): UserCatalog {
  const path = getConfig().providerCatalogPath;

  let mtimeMs: number;
  try {
    mtimeMs = statSync(path).mtimeMs;
  } catch {
    cache = null;
    return {};
  }
  if (cache && cache.path === path && cache.mtimeMs === mtimeMs) {
    return cache.catalog;
  }

  let catalog: UserCatalog = {};
  try {
    const parsed = userCatalogSchema.parse(JSON.parse(readFileSync(path, "utf8")));
    catalog = Object.fromEntries(
      Object.entries(parsed.models).map(([providerType, models]) => [
        providerType,
        dedupeModels(models.map((model) => ({ key: model.key, name: model.name ?? model.key, capabilities: model.capabilities ?? { chat: true } }))),
      ]),
    );
  } catch (error) {
    console.warn(`Ignoring invalid provider catalog at ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  cache = { path, mtimeMs, catalog };
  return catalog;
}

/** Overlays user catalog entries for `providerType` onto `models`: same key replaces, new keys are appended. */
export function mergeUserModels(providerType: string, models: CuratedModel[]): CuratedModel[] {
  const userModels = loadUserCatalog()[providerType] ?? [];
  if (userModels.length === 0) return models;
  const overridden = new Map(userModels.map((model) => [model.key, model]));
  const merged = models.map((model) => overridden.get(model.key) ?? model);
  const presentKeys = new Set(models.map((model) => model.key));
  return [...merged, ...userModels.filter((model) => !presentKeys.has(model.key))];
}

/** The built-in fallback models for a provider type, with the user catalog applied. */
export function getCuratedModels(providerType: string): CuratedModel[] {
  return mergeUserModels(providerType, CURATED_PROVIDER_MODELS[providerType] ?? []);
}

export function __resetUserCatalogForTests(): void {
  cache = null;
}
