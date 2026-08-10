import { and, eq, inArray, or } from "drizzle-orm";

import { getConfig } from "../config/index.js";
import type { ChikaimaDatabase } from "../db/client.js";
import { EMBEDDING_VECTOR_TABLE, getRawConnection } from "../db/client.js";
import { assetChunks } from "../db/schema.js";

export interface VectorStoreChunkInput {
  content: string;
  metadata: Record<string, unknown>;
  embedding: number[];
}

export interface StoredChunk {
  id: string;
  sourceType: string;
  sourceId: string;
  assetType: string;
  filename: string;
  chunkIndex: number;
  content: string;
  meta: Record<string, unknown>;
}

export interface ChunkSearchHit {
  chunk: StoredChunk;
  score: number;
}

export interface RetrievalSource {
  sourceType: string;
  sourceId: string;
  assetType: string;
  filename: string;
  score: number;
  chunks: ChunkSearchHit[];
}

export interface VectorSearchOptions {
  sourceType?: string;
  sourceIds?: Set<string>;
  sourceFilters?: Record<string, Set<string>>;
  assetTypes?: Set<string>;
  limit?: number;
}

const MAX_CHUNKS_PER_SOURCE = 3;

function toStoredChunk(row: typeof assetChunks.$inferSelect): StoredChunk {
  return {
    id: String(row.id),
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    assetType: row.assetType,
    filename: row.filename,
    chunkIndex: row.chunkIndex,
    content: row.content,
    meta: row.meta as Record<string, unknown>,
  };
}

/**
 * VectorStore backed by SQLite: chunk metadata lives in the ordinary
 * `asset_chunks` table (queryable with Drizzle); embeddings live in the
 * `asset_chunk_vectors` sqlite-vec virtual table, keyed by the same integer
 * rowid. Replaces pgvector's `AssetChunk.embedding` column + ivfflat index
 * (see the migration audit, sections 3 and 11).
 */
export class VectorStore {
  constructor(private readonly db: ChikaimaDatabase) {}

  async insertChunks(params: {
    userId: string;
    sourceType: string;
    sourceId: string;
    assetType: string;
    filename: string;
    chunks: VectorStoreChunkInput[];
  }): Promise<StoredChunk[]> {
    const now = new Date().toISOString();
    const raw = getRawConnection();
    const insertVector = raw.prepare(`INSERT INTO ${EMBEDDING_VECTOR_TABLE}(rowid, embedding) VALUES (?, ?)`);

    const stored: StoredChunk[] = [];
    params.chunks.forEach((chunk, index) => {
      const result = this.db
        .insert(assetChunks)
        .values({
          userId: params.userId,
          sourceType: params.sourceType,
          sourceId: params.sourceId,
          assetType: params.assetType,
          filename: params.filename,
          chunkIndex: index,
          content: chunk.content,
          meta: chunk.metadata,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      const rowId = Number(result.lastInsertRowid);
      insertVector.run(BigInt(rowId), new Float32Array(chunk.embedding));
      stored.push({
        id: String(rowId),
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        assetType: params.assetType,
        filename: params.filename,
        chunkIndex: index,
        content: chunk.content,
        meta: chunk.metadata,
      });
    });

    return stored;
  }

  /** Deletes chunk metadata and their vectors for a source. Returns the number of chunks removed. */
  deleteBySource(userId: string, sourceType: string, sourceId: string): number {
    const rows = this.db
      .select({ id: assetChunks.id })
      .from(assetChunks)
      .where(and(eq(assetChunks.userId, userId), eq(assetChunks.sourceType, sourceType), eq(assetChunks.sourceId, sourceId)))
      .all();
    if (rows.length === 0) return 0;

    const raw = getRawConnection();
    const deleteVector = raw.prepare(`DELETE FROM ${EMBEDDING_VECTOR_TABLE} WHERE rowid = ?`);
    for (const row of rows) {
      deleteVector.run(BigInt(row.id));
    }

    this.db.delete(assetChunks).where(and(eq(assetChunks.userId, userId), eq(assetChunks.sourceType, sourceType), eq(assetChunks.sourceId, sourceId))).run();
    return rows.length;
  }

  search(userId: string, queryVector: number[], options: VectorSearchOptions = {}): RetrievalSource[] {
    const limit = options.limit ?? getConfig().ragTopK;

    const filters = [eq(assetChunks.userId, userId)];
    if (options.sourceFilters && Object.keys(options.sourceFilters).length > 0) {
      const clauses = Object.entries(options.sourceFilters)
        .filter(([, ids]) => ids.size > 0)
        .map(([sourceType, ids]) => and(eq(assetChunks.sourceType, sourceType), inArray(assetChunks.sourceId, [...ids])));
      if (clauses.length === 0) return [];
      filters.push(or(...clauses)!);
    } else if (options.sourceType) {
      filters.push(eq(assetChunks.sourceType, options.sourceType));
    }
    if (options.sourceIds && options.sourceIds.size > 0) {
      filters.push(inArray(assetChunks.sourceId, [...options.sourceIds]));
    }
    if (options.assetTypes && options.assetTypes.size > 0) {
      filters.push(inArray(assetChunks.assetType, [...options.assetTypes]));
    }

    const candidates = this.db.select().from(assetChunks).where(and(...filters)).all();
    if (candidates.length === 0) return [];

    const candidateById = new Map(candidates.map((row) => [row.id, row]));
    const idList = candidates.map((row) => row.id).join(",");

    const raw = getRawConnection();
    const matches = raw
      .prepare(`SELECT rowid, distance FROM ${EMBEDDING_VECTOR_TABLE} WHERE rowid IN (${idList}) AND embedding MATCH ? AND k = ${candidates.length} ORDER BY distance`)
      .all(new Float32Array(queryVector)) as { rowid: number; distance: number }[];

    const grouped = new Map<string, RetrievalSource>();
    for (const match of matches) {
      const row = candidateById.get(match.rowid);
      if (!row) continue;
      const score = Math.max(0, 1 - match.distance);
      if (score <= 0) continue;

      const key = `${row.sourceType}:${row.sourceId}`;
      let entry = grouped.get(key);
      if (!entry) {
        entry = { sourceType: row.sourceType, sourceId: row.sourceId, assetType: row.assetType, filename: row.filename, score, chunks: [] };
        grouped.set(key, entry);
      }
      entry.score = Math.max(entry.score, score);
      if (entry.chunks.length < MAX_CHUNKS_PER_SOURCE) {
        entry.chunks.push({ chunk: toStoredChunk(row), score });
      }
    }

    return [...grouped.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  }
}
