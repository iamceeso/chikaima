export interface CuratedModel {
  key: string;
  name: string;
  capabilities: Record<string, boolean>;
}

export const CURATED_PROVIDER_MODELS: Record<string, CuratedModel[]> = {
  openai: [
    { key: "gpt-5.2", name: "GPT-5.2", capabilities: { chat: true, vision: true } },
    { key: "gpt-5", name: "GPT-5", capabilities: { chat: true, vision: true } },
    { key: "gpt-5-mini", name: "GPT-5 mini", capabilities: { chat: true, vision: true } },
    { key: "gpt-5-nano", name: "GPT-5 nano", capabilities: { chat: true } },
    { key: "gpt-4.1", name: "GPT-4.1", capabilities: { chat: true, vision: true } },
    { key: "gpt-4.1-mini", name: "GPT-4.1 mini", capabilities: { chat: true, vision: true } },
    { key: "gpt-4.1-nano", name: "GPT-4.1 nano", capabilities: { chat: true } },
    { key: "gpt-4o", name: "GPT-4o", capabilities: { chat: true, vision: true, audio: true } },
    { key: "gpt-4o-mini", name: "GPT-4o mini", capabilities: { chat: true, vision: true } },
    { key: "o4-mini", name: "o4-mini", capabilities: { chat: true } },
    { key: "o3", name: "o3", capabilities: { chat: true } },
    { key: "o3-mini", name: "o3-mini", capabilities: { chat: true } },
  ],
  anthropic: [
    { key: "claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5", capabilities: { chat: true, vision: true } },
    { key: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", capabilities: { chat: true, vision: true } },
    { key: "claude-opus-4-1-20250805", name: "Claude Opus 4.1", capabilities: { chat: true, vision: true } },
    { key: "claude-opus-4-20250514", name: "Claude Opus 4", capabilities: { chat: true, vision: true } },
    { key: "claude-3-7-sonnet-20250219", name: "Claude Sonnet 3.7", capabilities: { chat: true, vision: true } },
    { key: "claude-3-5-haiku-20241022", name: "Claude Haiku 3.5", capabilities: { chat: true, vision: true } },
  ],
  gemini: [
    { key: "gemini-2.5-pro", name: "Gemini 2.5 Pro", capabilities: { chat: true, vision: true, audio: true } },
    { key: "gemini-2.5-flash", name: "Gemini 2.5 Flash", capabilities: { chat: true, vision: true, audio: true } },
    { key: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash-Lite", capabilities: { chat: true, vision: true, audio: true } },
    { key: "gemini-3-pro-preview", name: "Gemini 3 Pro Preview", capabilities: { chat: true, vision: true, audio: true } },
    { key: "gemini-3-flash-preview", name: "Gemini 3 Flash Preview", capabilities: { chat: true, vision: true, audio: true } },
  ],
  ollama: [
    { key: "llama3.1", name: "Llama 3.1", capabilities: { chat: true, local: true } },
    { key: "gemma3", name: "Gemma 3", capabilities: { chat: true, local: true } },
    { key: "qwen3", name: "Qwen 3", capabilities: { chat: true, local: true } },
  ],
  openrouter: [
    { key: "~openai/gpt-latest", name: "OpenAI latest alias", capabilities: { chat: true, vision: true } },
    { key: "~anthropic/claude-sonnet-latest", name: "Claude Sonnet latest alias", capabilities: { chat: true, vision: true } },
    { key: "openai/gpt-4o-mini", name: "GPT-4o mini via OpenRouter", capabilities: { chat: true, vision: true } },
  ],
  litellm: [
    { key: "gpt-4o-mini", name: "GPT-4o mini via LiteLLM", capabilities: { chat: true, vision: true } },
    { key: "claude-3-5-haiku-20241022", name: "Claude Haiku via LiteLLM", capabilities: { chat: true, vision: true } },
    { key: "gemini-2.5-flash", name: "Gemini Flash via LiteLLM", capabilities: { chat: true, vision: true, audio: true } },
  ],
  local: [
    { key: "qwen3", name: "Qwen 3", capabilities: { chat: true, local: true } },
    { key: "llama3.1", name: "Llama 3.1", capabilities: { chat: true, local: true } },
    { key: "gemma3", name: "Gemma 3", capabilities: { chat: true, local: true } },
  ],
};

export const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
  ollama: "http://localhost:11434",
  openrouter: "https://openrouter.ai/api/v1",
  litellm: "http://localhost:4000/v1",
  local: "http://localhost:4000/v1",
};

export const OPENAI_EXCLUDED_MODEL_TOKENS = [
  "audio",
  "transcribe",
  "tts",
  "realtime",
  "image",
  "embedding",
  "moderation",
  "search-preview",
  "deep-research",
  "codex",
  "whisper",
];

export const MODEL_PRIORITY: Record<string, Record<string, number>> = {
  openai: {
    "gpt-5.2": 0,
    "gpt-5": 1,
    "gpt-5-mini": 2,
    "gpt-5-nano": 3,
    "gpt-4.1": 4,
    "gpt-4o": 5,
    "gpt-4.1-mini": 6,
    "gpt-4o-mini": 7,
    "gpt-4.1-nano": 8,
    o3: 9,
    "o4-mini": 10,
    "o3-mini": 11,
  },
  anthropic: {
    "claude-sonnet-4-5-20250929": 0,
    "claude-sonnet-4-20250514": 1,
    "claude-opus-4-1-20250805": 2,
    "claude-opus-4-20250514": 3,
    "claude-3-7-sonnet-20250219": 4,
    "claude-3-5-haiku-20241022": 5,
  },
  gemini: {
    "gemini-2.5-pro": 0,
    "gemini-2.5-flash": 1,
    "gemini-2.5-flash-lite": 2,
    "gemini-3-pro-preview": 3,
    "gemini-3-flash-preview": 4,
  },
  local: { qwen3: 0, "llama3.1": 1, gemma3: 2 },
};

export const DEPRECATED_MODEL_KEYS: Record<string, Set<string>> = {
  openai: new Set(["gpt-3.5-turbo", "gpt-4", "gpt-4-turbo", "gpt-4-turbo-preview", "gpt-4.5-preview", "o1-preview", "o1-mini", "codex-mini-latest"]),
  anthropic: new Set(["claude-3-7-sonnet-20250219", "claude-3-5-sonnet-20240620", "claude-3-5-sonnet-20241022", "claude-3-opus-20240229"]),
};

export function isDeprecatedModel(providerType: string | null | undefined, modelKey: string): boolean {
  if (!providerType) return false;
  return DEPRECATED_MODEL_KEYS[providerType]?.has(modelKey) ?? false;
}

export function dedupeModels(models: CuratedModel[]): CuratedModel[] {
  const seen = new Set<string>();
  const deduped: CuratedModel[] = [];
  for (const model of models) {
    const key = String(model.key).trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push({ key, name: String(model.name || key), capabilities: { ...(model.capabilities || { chat: true }) } });
  }
  return deduped;
}

export function titleizeModelName(modelKey: string): string {
  return modelKey
    .replace(/-/g, " ")
    .replace(/_/g, " ")
    .replace(/\./g, ". ")
    .replace(/ {2}/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\. /g, ".");
}

export function openaiCapabilities(modelId: string): Record<string, boolean> {
  const lowered = modelId.toLowerCase();
  const capabilities: Record<string, boolean> = { chat: true };
  if (lowered.startsWith("gpt-") || lowered.startsWith("chatgpt-") || ["o3", "o3-mini", "o4-mini", "o1", "o1-pro"].includes(lowered)) {
    capabilities.vision = ["gpt-4", "gpt-5", "gpt-4o"].some((token) => lowered.includes(token));
  }
  if (["vision", "vl", "multimodal", "gemini", "claude", "gpt-4o", "gpt-4.1", "gpt-5"].some((token) => lowered.includes(token))) {
    capabilities.vision = true;
  }
  if (["audio", "speech", "realtime"].some((token) => lowered.includes(token))) {
    capabilities.audio = true;
  }
  return capabilities;
}

export function geminiCapabilities(modelName: string): Record<string, boolean> {
  const lowered = modelName.toLowerCase();
  const capabilities: Record<string, boolean> = { chat: true, vision: true };
  if (lowered.includes("gemini")) capabilities.audio = true;
  return capabilities;
}

export function resolveBaseUrl(providerType: string, baseUrl?: string | null): string | null {
  return baseUrl || DEFAULT_BASE_URLS[providerType] || null;
}

export function joinApiUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const normalizedPath = path.replace(/^\/+/, "");
  if (normalizedBase.endsWith(`/${normalizedPath}`)) {
    return normalizedBase;
  }
  return new URL(normalizedPath, `${normalizedBase}/`).toString();
}

export function shouldIncludeOpenaiModel(modelId: string): boolean {
  const lowered = modelId.toLowerCase();
  if (OPENAI_EXCLUDED_MODEL_TOKENS.some((token) => lowered.includes(token))) return false;
  return ["gpt-", "o1", "o3", "o4", "chatgpt-", "gpt-oss-"].some((prefix) => lowered.startsWith(prefix));
}

export function shouldIncludeOpenrouterModel(modelId: string): boolean {
  const lowered = modelId.toLowerCase();
  const excludedTokens = ["embedding", "moderation", "image", "transcribe", "tts", "rerank"];
  return !excludedTokens.some((token) => lowered.includes(token));
}

export function sortModels(providerType: string, models: CuratedModel[]): CuratedModel[] {
  const priorityMap = MODEL_PRIORITY[providerType] ?? {};
  return [...models].sort((a, b) => {
    const priorityA = priorityMap[a.key] ?? 10_000;
    const priorityB = priorityMap[b.key] ?? 10_000;
    if (priorityA !== priorityB) return priorityA - priorityB;
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });
}
