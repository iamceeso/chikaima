import { badRequest } from "../errors.js";
import { getConfig } from "../config/index.js";
import { AnthropicAdapter } from "./adapters/anthropic.js";
import { GeminiAdapter } from "./adapters/gemini.js";
import { OllamaAdapter } from "./adapters/ollama.js";
import { OpenAIAdapter } from "./adapters/openai.js";
import type { ProviderAdapter } from "./types.js";

export interface ProviderLike {
  name: string;
  providerType: string;
  baseUrl: string | null;
}

export class AdapterFactory {
  static create(provider: ProviderLike, apiKey: string): ProviderAdapter {
    const providerType = provider.providerType.toLowerCase();
    const providerLabel = provider.name || provider.providerType[0]?.toUpperCase() + provider.providerType.slice(1);

    switch (providerType) {
      case "openai":
        return new OpenAIAdapter({ apiKey, providerLabel });
      case "openrouter":
        return new OpenAIAdapter({ apiKey, baseUrl: provider.baseUrl || "https://openrouter.ai/api/v1", providerLabel });
      case "litellm":
        return new OpenAIAdapter({ apiKey, baseUrl: provider.baseUrl || "http://localhost:4000/v1", providerLabel });
      case "local":
        return new OpenAIAdapter({ apiKey, baseUrl: provider.baseUrl || "http://localhost:4000/v1", providerLabel });
      case "anthropic":
        return new AnthropicAdapter({ apiKey, baseUrl: provider.baseUrl });
      case "gemini":
        return new GeminiAdapter({ apiKey, baseUrl: provider.baseUrl });
      case "ollama":
        return new OllamaAdapter(provider.baseUrl || getConfig().ollamaBaseUrl);
      default:
        throw badRequest(`Unsupported provider type: ${providerType}`);
    }
  }
}
