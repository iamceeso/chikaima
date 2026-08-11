import type { ChunkPayload } from "../chunking/index.js";

export interface IngestibleResource {
  id: string;
  name: string;
  filePath: string;
  userId: string;
}

export interface ExtractedAsset {
  content: string;
  metadata: Record<string, unknown>;
  chunks: ChunkPayload[];
  transcript?: string | null;
}

export interface ResourceProcessor {
  supports(resource: IngestibleResource, mimeType: string | null): boolean;
  extract(resource: IngestibleResource, mimeType: string | null): Promise<ExtractedAsset>;
}

export class AssetProcessingError extends Error {}

export function emptyExtractedAsset(content = ""): ExtractedAsset {
  return { content, metadata: {}, chunks: [] };
}
