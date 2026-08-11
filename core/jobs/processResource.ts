import { randomUUID } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";

import { LLMService } from "../chat/llmService.js";
import { generateSummaryBundle, type SummaryBundle } from "../assets/summaryBundle.js";
import { chunkText, type ChunkPayload } from "../chunking/index.js";
import type { ChikaimaDatabase } from "../db/client.js";
import { audioAssets, documents, jobs, summaryArtifacts, transcripts, videos } from "../db/schema.js";
import { documentProcessorRegistry } from "../documents/registry.js";
import { EmbeddingsService } from "../embeddings/embeddingsService.js";
import { TranscriptionProviderService } from "../media/transcriptionService.js";
import type { JobRow } from "./repository.js";
import type { JobType } from "./types.js";
import { RESOURCE_TYPE_BY_JOB_TYPE } from "./types.js";

type ResourceKind = "audio" | "video" | "document";
type ResourceRow = typeof audioAssets.$inferSelect | typeof videos.$inferSelect | typeof documents.$inferSelect;

function resourceTable(kind: ResourceKind) {
  if (kind === "audio") return audioAssets;
  if (kind === "video") return videos;
  return documents;
}

function resolveAssetType(resourceType: ResourceKind, resource: ResourceRow): string {
  if (resourceType === "audio" || resourceType === "video") return resourceType;
  const mimeType = "mimeType" in resource ? resource.mimeType : "";
  if (mimeType === "application/pdf") return "document";
  if (
    [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ].includes(mimeType)
  ) {
    return "office";
  }
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("text/")) return "text";
  if (/\.(js|ts|tsx|jsx|py|cs|java|go|rs)$/i.test(resource.name)) return "code";
  return "document";
}

export async function processResourceJob(db: ChikaimaDatabase, jobId: string, jobType: JobType): Promise<{ jobId: string; status: string; resourceId?: string; message?: string }> {
  const resourceType = RESOURCE_TYPE_BY_JOB_TYPE[jobType] as ResourceKind;
  const table = resourceTable(resourceType);

  const job = db.select().from(jobs).where(eq(jobs.id, jobId)).get();
  if (!job) {
    return { jobId, status: "failed", message: "Job not found" };
  }

  const resource = job.resourceId ? (db.select().from(table).where(eq(table.id, job.resourceId)).get() as ResourceRow | undefined) : undefined;
  if (!resource) {
    markJobFailed(db, job, "Resource not found");
    return { jobId, status: "failed", message: "Resource not found" };
  }

  db.update(table).set({ status: "processing", updatedAt: new Date().toISOString() }).where(eq(table.id, resource.id)).run();

  try {
    let extractedText: string;
    let extractedChunks: ChunkPayload[];

    if (resourceType === "audio" || resourceType === "video") {
      const transcribed = await new TranscriptionProviderService(db).transcribeMedia(resource.userId, resource.filePath, resource.name, null);
      extractedText = transcribed.trim();
      if (resourceType === "video" && !extractedText) {
        extractedText = `No spoken audio was detected in ${resource.name}.`;
      }
      if (!extractedText) {
        throw new Error(`No transcript content could be extracted from ${resource.name}.`);
      }
      extractedChunks = extractedText ? chunkText(extractedText) : [];
    } else {
      const mimeType = "mimeType" in resource ? resource.mimeType : null;
      const extracted = await documentProcessorRegistry.select(resource, mimeType).extract(resource, mimeType);
      extractedText = (extracted.transcript || extracted.content || "").trim();
      extractedChunks = extracted.chunks;
      if (extractedText && extractedChunks.length === 0) {
        extractedChunks = chunkText(extractedText);
      }
    }

    const transcript = upsertTranscript(db, resource, resourceType, extractedText);
    const summaryBundle = await generateSummaryBundle(new LLMService(db), resource.userId, resourceType, resource.name, extractedText);
    upsertSummaryArtifacts(db, resource, resourceType, summaryBundle);
    updateResourceFields(db, resource, resourceType, extractedText, summaryBundle);

    await new EmbeddingsService(db).replaceChunksForSource({
      userId: resource.userId,
      sourceType: resourceType,
      sourceId: resource.id,
      assetType: resolveAssetType(resourceType, resource),
      filename: resource.name,
      chunks: extractedChunks.map((chunk) => ({ content: chunk.content, metadata: chunk.metadata })),
    });

    const now = new Date().toISOString();
    db.update(table).set({ status: "completed", updatedAt: now }).where(eq(table.id, resource.id)).run();
    db.update(jobs)
      .set({ status: "completed", progress: 100, result: { resource_type: resourceType, resource_id: resource.id, transcript_id: transcript.id }, completedAt: now, updatedAt: now })
      .where(eq(jobs.id, jobId))
      .run();

    return { jobId, status: "completed", resourceId: resource.id };
  } catch (error) {
    // Resource status reflects this attempt's real outcome immediately; the
    // job's own status (retry vs. terminal failure) is decided by the
    // caller (JobWorker.runOnce -> markFailedOrRetry), which knows whether
    // attempts remain — this function doesn't have that context.
    db.update(table).set({ status: "failed", updatedAt: new Date().toISOString() }).where(eq(table.id, resource.id)).run();
    throw error;
  }
}

function markJobFailed(db: ChikaimaDatabase, job: JobRow, message: string): void {
  db.update(jobs).set({ status: "failed", errorMessage: message, completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).where(eq(jobs.id, job.id)).run();
}

function upsertTranscript(db: ChikaimaDatabase, resource: ResourceRow, resourceType: ResourceKind, content: string) {
  const existing = db
    .select()
    .from(transcripts)
    .where(and(eq(transcripts.userId, resource.userId), eq(transcripts.resourceType, resourceType), eq(transcripts.resourceId, resource.id)))
    .orderBy(desc(transcripts.createdAt))
    .get();

  const now = new Date().toISOString();
  const segments = content ? [{ speaker: "system", text: content }] : [];

  if (existing) {
    db.update(transcripts).set({ content, segments, status: "completed", updatedAt: now }).where(eq(transcripts.id, existing.id)).run();
    return { ...existing, content, segments };
  }

  const row = {
    id: randomUUID(),
    userId: resource.userId,
    resourceType,
    resourceId: resource.id,
    language: "en",
    content,
    segments,
    status: "completed",
    createdAt: now,
    updatedAt: now,
  };
  db.insert(transcripts).values(row).run();
  return row;
}

function upsertSummaryArtifacts(db: ChikaimaDatabase, resource: ResourceRow, resourceType: ResourceKind, bundle: SummaryBundle): void {
  const existing = db
    .select()
    .from(summaryArtifacts)
    .where(and(eq(summaryArtifacts.userId, resource.userId), eq(summaryArtifacts.resourceType, resourceType), eq(summaryArtifacts.resourceId, resource.id)))
    .all();
  const byType = new Map(existing.map((item) => [item.summaryType, item]));
  const now = new Date().toISOString();

  const summaryExisting = byType.get("summary");
  if (summaryExisting) {
    db.update(summaryArtifacts).set({ content: bundle.summary, data: {}, status: "completed", updatedAt: now }).where(eq(summaryArtifacts.id, summaryExisting.id)).run();
  } else {
    db.insert(summaryArtifacts)
      .values({
        id: randomUUID(),
        userId: resource.userId,
        resourceType,
        resourceId: resource.id,
        summaryType: "summary",
        content: bundle.summary,
        data: {},
        status: "completed",
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  const keyPointsExisting = byType.get("key_points");
  if (keyPointsExisting) {
    db.update(summaryArtifacts)
      .set({ content: "", data: { items: bundle.keyPoints }, status: "completed", updatedAt: now })
      .where(eq(summaryArtifacts.id, keyPointsExisting.id))
      .run();
  } else {
    db.insert(summaryArtifacts)
      .values({
        id: randomUUID(),
        userId: resource.userId,
        resourceType,
        resourceId: resource.id,
        summaryType: "key_points",
        content: "",
        data: { items: bundle.keyPoints },
        status: "completed",
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }
}

function updateResourceFields(db: ChikaimaDatabase, resource: ResourceRow, resourceType: ResourceKind, transcriptText: string, bundle: SummaryBundle): void {
  const now = new Date().toISOString();
  if (resourceType === "audio") {
    db.update(audioAssets).set({ transcript: transcriptText, updatedAt: now }).where(eq(audioAssets.id, resource.id)).run();
  } else if (resourceType === "video") {
    db.update(videos)
      .set({ transcript: transcriptText, summary: bundle.summary, chapters: bundle.chapters, actionItems: bundle.actionItems, updatedAt: now })
      .where(eq(videos.id, resource.id))
      .run();
  } else {
    db.update(documents).set({ summary: bundle.summary, updatedAt: now }).where(eq(documents.id, resource.id)).run();
  }
}
