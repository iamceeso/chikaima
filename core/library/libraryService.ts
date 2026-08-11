import { eq } from "drizzle-orm";

import {
  toAudioResponse,
  toDocumentResponse,
  toVideoResponse,
  type AudioAssetResponse,
  type DocumentAssetResponse,
  type VideoAssetResponse,
} from "../assets/assetResponses.js";
import type { ChikaimaDatabase } from "../db/client.js";
import { audioAssets, documents, videos } from "../db/schema.js";

export interface LibraryBundleResponse {
  audio: AudioAssetResponse[];
  videos: VideoAssetResponse[];
  documents: DocumentAssetResponse[];
}

/**
 * No caching layer here, unlike the Python backend's Redis-backed 15s
 * library cache (see the migration audit, §7/§15) — at local-desktop scale,
 * three indexed SQLite SELECTs are fast enough that the cache was pure
 * complexity for no measurable benefit, and dropping it also removes the
 * "Redis used outside Celery" dependency entirely.
 */
export class LibraryService {
  constructor(private readonly db: ChikaimaDatabase) {}

  getBundle(userId: string): LibraryBundleResponse {
    return {
      audio: this.db.select().from(audioAssets).where(eq(audioAssets.userId, userId)).all().map(toAudioResponse),
      videos: this.db.select().from(videos).where(eq(videos.userId, userId)).all().map(toVideoResponse),
      documents: this.db.select().from(documents).where(eq(documents.userId, userId)).all().map(toDocumentResponse),
    };
  }
}
