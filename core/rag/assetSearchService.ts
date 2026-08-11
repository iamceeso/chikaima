import type { ChikaimaDatabase } from "../db/client.js";
import { EmbeddingProviderError, EmbeddingsService } from "../embeddings/embeddingsService.js";
import { VectorStore, type RetrievalSource, type VectorSearchOptions } from "./vectorStore.js";

export type { RetrievalSource, ChunkSearchHit } from "./vectorStore.js";

export class AssetSearchService {
  private readonly embeddings: EmbeddingsService;
  private readonly vectorStore: VectorStore;

  constructor(private readonly db: ChikaimaDatabase) {
    this.embeddings = new EmbeddingsService(db);
    this.vectorStore = new VectorStore(db);
  }

  async search(userId: string, query: string, options: VectorSearchOptions = {}): Promise<RetrievalSource[]> {
    if (!query.trim()) return [];

    let sourceFilters = options.sourceFilters;
    if (sourceFilters) {
      sourceFilters = Object.fromEntries(Object.entries(sourceFilters).filter(([type, ids]) => type && ids.size > 0));
      if (Object.keys(sourceFilters).length === 0) return [];
    }

    let queryVector: number[];
    try {
      queryVector = await this.embeddings.generateEmbedding(userId, query);
    } catch (error) {
      if (error instanceof EmbeddingProviderError) return [];
      throw error;
    }

    return this.vectorStore.search(userId, queryVector, { ...options, sourceFilters });
  }
}
