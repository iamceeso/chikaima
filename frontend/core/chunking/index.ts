export interface ChunkPayload {
  content: string;
  metadata: Record<string, unknown>;
}

export const TEXT_CHUNK_SIZE = 4_000;
export const TEXT_CHUNK_OVERLAP = 800;

/** Fixed-size sliding-window chunker, matching `chunk_text` in the Python backend's asset_processors.py. */
export function chunkText(text: string, baseMetadata: Record<string, unknown> = {}): ChunkPayload[] {
  const normalized = text.split(/\s+/).filter(Boolean).join(" ");
  if (!normalized) return [];
  if (normalized.length <= TEXT_CHUNK_SIZE) {
    return [{ content: normalized, metadata: { ...baseMetadata } }];
  }

  const chunks: ChunkPayload[] = [];
  const step = TEXT_CHUNK_SIZE - TEXT_CHUNK_OVERLAP;
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(normalized.length, start + TEXT_CHUNK_SIZE);
    const content = normalized.slice(start, end).trim();
    if (content) {
      chunks.push({ content, metadata: { ...baseMetadata } });
    }
    if (end >= normalized.length) break;
    start += step;
  }
  return chunks;
}
