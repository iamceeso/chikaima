import type { audioAssets, documents, summaryArtifacts, transcripts, videos } from "../db/schema.js";

export interface DocumentAssetResponse {
  id: string;
  name: string;
  file_path: string;
  mime_type: string;
  summary: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface AudioAssetResponse {
  id: string;
  name: string;
  file_path: string;
  transcript: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface VideoAssetResponse {
  id: string;
  name: string;
  file_path: string;
  transcript: string | null;
  summary: string | null;
  chapters: unknown[];
  action_items: unknown[];
  status: string;
  created_at: string;
  updated_at: string;
}

export interface TranscriptResponse {
  id: string;
  user_id: string;
  resource_type: string;
  resource_id: string;
  language: string | null;
  content: string;
  segments: unknown[];
  status: string;
  created_at: string;
  updated_at: string;
}

export interface SummaryArtifactResponse {
  id: string;
  user_id: string;
  resource_type: string;
  resource_id: string;
  summary_type: string;
  content: string | null;
  data: Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at: string;
}

export function toDocumentResponse(row: typeof documents.$inferSelect): DocumentAssetResponse {
  return {
    id: row.id,
    name: row.name,
    file_path: row.filePath,
    mime_type: row.mimeType,
    summary: row.summary,
    status: row.status,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export function toAudioResponse(row: typeof audioAssets.$inferSelect): AudioAssetResponse {
  return {
    id: row.id,
    name: row.name,
    file_path: row.filePath,
    transcript: row.transcript,
    status: row.status,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export function toVideoResponse(row: typeof videos.$inferSelect): VideoAssetResponse {
  return {
    id: row.id,
    name: row.name,
    file_path: row.filePath,
    transcript: row.transcript,
    summary: row.summary,
    chapters: row.chapters as unknown[],
    action_items: row.actionItems as unknown[],
    status: row.status,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export function toTranscriptResponse(row: typeof transcripts.$inferSelect): TranscriptResponse {
  return {
    id: row.id,
    user_id: row.userId,
    resource_type: row.resourceType,
    resource_id: row.resourceId,
    language: row.language,
    content: row.content,
    segments: row.segments as unknown[],
    status: row.status,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export function toSummaryArtifactResponse(row: typeof summaryArtifacts.$inferSelect): SummaryArtifactResponse {
  return {
    id: row.id,
    user_id: row.userId,
    resource_type: row.resourceType,
    resource_id: row.resourceId,
    summary_type: row.summaryType,
    content: row.content,
    data: row.data as Record<string, unknown>,
    status: row.status,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}
