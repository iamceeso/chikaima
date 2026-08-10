import { and, desc, eq } from "drizzle-orm";

import { getSecretManager } from "../crypto/index.js";
import type { ChikaimaDatabase } from "../db/client.js";
import { aiModels, providers } from "../db/schema.js";
import { badGateway, badRequest } from "../errors.js";
import { AdapterFactory } from "../providers/factory.js";
import type { ChatMessage } from "../providers/types.js";
import { AssetSearchService } from "../rag/assetSearchService.js";

export type AIModelRow = typeof aiModels.$inferSelect;
export type ProviderRow = typeof providers.$inferSelect;

export interface RagCitation {
  source_type: string;
  source_id: string;
  asset_type: string;
  filename: string;
  chunk_id: string;
  chunk_index: number;
  reference: string;
  excerpt: string;
  location: Record<string, string | number>;
  score: number;
}

const RAG_SEARCH_LIMIT = 3;
const RAG_CHUNKS_PER_SOURCE = 1;

export class LLMService {
  private readonly assetSearch: AssetSearchService;

  constructor(private readonly db: ChikaimaDatabase) {
    this.assetSearch = new AssetSearchService(db);
  }

  resolveModelAndProvider(userId: string, modelId?: string | null): { model: AIModelRow; provider: ProviderRow } {
    const base = and(eq(providers.userId, userId), eq(providers.isEnabled, true), eq(aiModels.isAvailable, true));

    let selection: { model: AIModelRow; provider: ProviderRow } | undefined;
    if (modelId) {
      selection = this.db
        .select({ model: aiModels, provider: providers })
        .from(aiModels)
        .innerJoin(providers, eq(providers.id, aiModels.providerId))
        .where(and(base, eq(aiModels.id, modelId)))
        .get();
    }
    if (!selection) {
      selection = this.db
        .select({ model: aiModels, provider: providers })
        .from(aiModels)
        .innerJoin(providers, eq(providers.id, aiModels.providerId))
        .where(base)
        .orderBy(desc(aiModels.isDefault), aiModels.createdAt)
        .get();
    }

    if (!selection) {
      throw badRequest("No enabled AI model is available. Add an OpenAI provider and model first.");
    }
    return selection;
  }

  async generateReply(provider: ProviderRow, model: AIModelRow, messages: ChatMessage[]): Promise<string> {
    const adapter = this.buildAdapter(provider);
    const content = await adapter.generateReply(model.modelKey, messages);
    if (!content) {
      throw badGateway("The AI provider returned an empty response.");
    }
    return content;
  }

  async *streamReply(provider: ProviderRow, model: AIModelRow, messages: ChatMessage[]): AsyncIterable<string> {
    const adapter = this.buildAdapter(provider);
    let yielded = false;
    for await (const chunk of adapter.streamReply(model.modelKey, messages)) {
      if (!chunk) continue;
      yielded = true;
      yield chunk;
    }
    if (!yielded) {
      throw badGateway("The AI provider returned an empty streamed response.");
    }
  }

  private buildAdapter(provider: ProviderRow) {
    const config = provider.encryptedConfig as Record<string, unknown>;
    const encryptedApiKey = config.api_key;
    if (!["ollama", "local"].includes(provider.providerType) && typeof encryptedApiKey !== "string") {
      throw badRequest(`${provider.name} is missing an API key.`);
    }
    const apiKey = typeof encryptedApiKey === "string" ? getSecretManager().decrypt(encryptedApiKey) : "";
    return AdapterFactory.create(provider, apiKey);
  }

  async generateReplyWithRag(params: {
    userId: string;
    provider: ProviderRow;
    model: AIModelRow;
    messages: ChatMessage[];
    includeContext?: boolean;
    sourceFilters?: Record<string, Set<string>>;
  }): Promise<{ content: string; citations: RagCitation[] }> {
    const { messages, includeContext = true } = params;
    const userMessage = messages.length > 0 ? this.contentToText(messages[messages.length - 1]!.content) : "";
    const citations: RagCitation[] = [];

    if (includeContext && userMessage) {
      const searchResults = await this.searchWithFallback(params.userId, userMessage, params.sourceFilters);
      if (searchResults.length > 0) {
        const { ragMessages, builtCitations } = this.buildRagMessages(searchResults, messages);
        citations.push(...builtCitations);
        const response = await this.generateReply(params.provider, params.model, ragMessages);
        return { content: response, citations };
      }
    }

    const response = await this.generateReply(params.provider, params.model, messages);
    return { content: response, citations };
  }

  async streamReplyWithRag(params: {
    userId: string;
    provider: ProviderRow;
    model: AIModelRow;
    messages: ChatMessage[];
    includeContext?: boolean;
    sourceFilters?: Record<string, Set<string>>;
  }): Promise<{ stream: AsyncIterable<string>; citations: RagCitation[] }> {
    const { messages, includeContext = true } = params;
    const userMessage = messages.length > 0 ? this.contentToText(messages[messages.length - 1]!.content) : "";
    const citations: RagCitation[] = [];
    let streamMessages = messages;

    if (includeContext && userMessage) {
      const searchResults = await this.searchWithFallback(params.userId, userMessage, params.sourceFilters);
      if (searchResults.length > 0) {
        const { ragMessages, builtCitations } = this.buildRagMessages(searchResults, messages);
        citations.push(...builtCitations);
        streamMessages = ragMessages;
      }
    }

    return { stream: this.streamReply(params.provider, params.model, streamMessages), citations };
  }

  private buildRagMessages(searchResults: Awaited<ReturnType<AssetSearchService["search"]>>, messages: ChatMessage[]) {
    const contextSections: string[] = [];
    const builtCitations: RagCitation[] = [];

    for (const result of searchResults) {
      for (const hit of result.chunks.slice(0, RAG_CHUNKS_PER_SOURCE)) {
        const reference = this.buildCitation(result.filename, hit.chunk.meta);
        builtCitations.push({
          source_type: result.sourceType,
          source_id: result.sourceId,
          asset_type: result.assetType,
          filename: result.filename,
          chunk_id: hit.chunk.id,
          chunk_index: hit.chunk.chunkIndex,
          reference,
          excerpt: hit.chunk.content.slice(0, 280),
          location: this.extractLocation(hit.chunk.meta),
          score: Math.round(hit.score * 10_000) / 10_000,
        });
        contextSections.push(`[${reference}]\n${hit.chunk.content}`);
      }
    }

    const context = contextSections.join("\n\n");
    const ragSystemMessage = `You are a helpful assistant with access to relevant workspace assets.
Use the provided chunk excerpts to answer the user's question.
When you rely on a chunk, cite it using the bracketed reference already included in the context.

${context}

---

If the context doesn't contain relevant information, answer based on your knowledge and say that no direct asset evidence was found.`;

    const ragMessages: ChatMessage[] = [{ role: "system", content: ragSystemMessage }, ...messages.slice(0, -1), messages[messages.length - 1]!];
    return { ragMessages, builtCitations };
  }

  private async searchWithFallback(userId: string, query: string, sourceFilters?: Record<string, Set<string>>) {
    try {
      return await this.assetSearch.search(userId, query, { limit: RAG_SEARCH_LIMIT, sourceFilters });
    } catch {
      return [];
    }
  }

  private contentToText(content: ChatMessage["content"]): string {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .filter((part): part is { type: "text"; text: string } => part.type === "text" && Boolean(part.text?.trim()))
        .map((part) => part.text.trim())
        .join("\n\n")
        .trim();
    }
    return String(content ?? "");
  }

  private buildCitation(filename: string, metadata: Record<string, unknown>): string {
    if (!metadata || typeof metadata !== "object") return filename;
    if ("page" in metadata) return `${filename} p.${metadata.page}`;
    if ("slide" in metadata) return `${filename} slide ${metadata.slide}`;
    if ("sheet" in metadata) return `${filename} sheet ${metadata.sheet}`;
    if ("start_line" in metadata && "end_line" in metadata) return `${filename} lines ${metadata.start_line}-${metadata.end_line}`;
    return `${filename} chunk ${metadata.chunk_index ?? 0}`;
  }

  private extractLocation(metadata: Record<string, unknown>): Record<string, string | number> {
    if (!metadata || typeof metadata !== "object") return {};
    const location: Record<string, string | number> = {};
    for (const key of ["page", "slide", "sheet", "start_line", "end_line", "chunk_index", "section_index"]) {
      const value = metadata[key];
      if (typeof value === "string" || typeof value === "number") {
        location[key] = value;
      }
    }
    return location;
  }
}
