import { randomUUID } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";

import { LLMService } from "../chat/llmService.js";
import type { ChikaimaDatabase } from "../db/client.js";
import { audioAssets, documents, jobs, summaryArtifacts, transcripts, videos } from "../db/schema.js";
import { badRequest, notFound } from "../errors.js";
import { AssetSearchService } from "../rag/assetSearchService.js";
import { VectorStore } from "../rag/vectorStore.js";
import { storageService } from "../storage/storageService.js";
import { generateSummaryBundle } from "./summaryBundle.js";

export type ResourceType = "document" | "audio" | "video";
export type ResourceRow = typeof documents.$inferSelect | typeof audioAssets.$inferSelect | typeof videos.$inferSelect;

export interface CreateResourceInput {
  name: string;
  filePath: string;
  mimeType?: string;
}

const RESOURCE_TABLES = { document: documents, audio: audioAssets, video: videos } as const;

const MAX_LLM_SOURCE_CHARS = 12_000;

function formatCitation(filename: string, metadata: Record<string, unknown>): string {
  if (!metadata || typeof metadata !== "object") return filename;
  if ("page" in metadata) return `${filename} page ${metadata.page}`;
  if ("slide" in metadata) return `${filename} slide ${metadata.slide}`;
  if ("sheet" in metadata) return `${filename} sheet ${metadata.sheet}`;
  if ("start_line" in metadata && "end_line" in metadata) return `${filename} lines ${metadata.start_line}-${metadata.end_line}`;
  if ("chunk_index" in metadata) return `${filename} chunk ${metadata.chunk_index}`;
  return filename;
}

export class AssetService {
  private readonly llm: LLMService;
  private readonly search: AssetSearchService;
  private readonly vectorStore: VectorStore;

  constructor(private readonly db: ChikaimaDatabase) {
    this.llm = new LLMService(db);
    this.search = new AssetSearchService(db);
    this.vectorStore = new VectorStore(db);
  }

  getForResource(userId: string, resourceType: ResourceType, resourceId: string) {
    const transcript = this.db
      .select()
      .from(transcripts)
      .where(and(eq(transcripts.userId, userId), eq(transcripts.resourceType, resourceType), eq(transcripts.resourceId, resourceId)))
      .orderBy(desc(transcripts.createdAt))
      .get();
    if (!transcript) throw notFound("Transcript not found");
    return transcript;
  }

  getResource(userId: string, resourceType: ResourceType, resourceId: string): ResourceRow {
    const table = RESOURCE_TABLES[resourceType];
    if (!table) throw badRequest("Unsupported resource type");
    const resource = this.db.select().from(table).where(eq(table.id, resourceId)).get();
    if (!resource || resource.userId !== userId) throw notFound("Resource not found");
    return resource;
  }

  listForUser(userId: string, resourceType: "document"): (typeof documents.$inferSelect)[];
  listForUser(userId: string, resourceType: "audio"): (typeof audioAssets.$inferSelect)[];
  listForUser(userId: string, resourceType: "video"): (typeof videos.$inferSelect)[];
  listForUser(userId: string, resourceType: ResourceType): ResourceRow[] {
    const table = RESOURCE_TABLES[resourceType];
    if (!table) throw badRequest("Unsupported resource type");
    return this.db.select().from(table).where(eq(table.userId, userId)).all();
  }

  /** Inserts a `pending` resource row for a just-saved upload, ready for a job to pick up. */
  createResource(userId: string, resourceType: "document", input: CreateResourceInput): typeof documents.$inferSelect;
  createResource(userId: string, resourceType: "audio", input: CreateResourceInput): typeof audioAssets.$inferSelect;
  createResource(userId: string, resourceType: "video", input: CreateResourceInput): typeof videos.$inferSelect;
  createResource(userId: string, resourceType: ResourceType, input: CreateResourceInput): ResourceRow {
    const now = new Date().toISOString();
    const id = randomUUID();

    if (resourceType === "document") {
      const row: typeof documents.$inferSelect = {
        id,
        userId,
        name: input.name,
        filePath: input.filePath,
        mimeType: input.mimeType ?? "application/octet-stream",
        summary: null,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      };
      this.db.insert(documents).values(row).run();
      return row;
    }

    if (resourceType === "audio") {
      const row: typeof audioAssets.$inferSelect = {
        id,
        userId,
        name: input.name,
        filePath: input.filePath,
        transcript: null,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      };
      this.db.insert(audioAssets).values(row).run();
      return row;
    }

    const row: typeof videos.$inferSelect = {
      id,
      userId,
      name: input.name,
      filePath: input.filePath,
      transcript: null,
      summary: null,
      chapters: [],
      actionItems: [],
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    this.db.insert(videos).values(row).run();
    return row;
  }

  async deleteResource(userId: string, resourceType: ResourceType, resourceId: string): Promise<void> {
    const resource = this.getResource(userId, resourceType, resourceId);
    await storageService.deleteFile("filePath" in resource ? resource.filePath : null);

    this.vectorStore.deleteBySource(userId, resourceType, resourceId);
    this.db.delete(jobs).where(and(eq(jobs.userId, userId), eq(jobs.resourceType, resourceType), eq(jobs.resourceId, resourceId))).run();
    this.db
      .delete(transcripts)
      .where(and(eq(transcripts.userId, userId), eq(transcripts.resourceType, resourceType), eq(transcripts.resourceId, resourceId)))
      .run();
    this.db
      .delete(summaryArtifacts)
      .where(and(eq(summaryArtifacts.userId, userId), eq(summaryArtifacts.resourceType, resourceType), eq(summaryArtifacts.resourceId, resourceId)))
      .run();

    const table = RESOURCE_TABLES[resourceType];
    this.db.delete(table).where(eq(table.id, resourceId)).run();
  }

  async deleteAllResources(userId: string, resourceType: ResourceType): Promise<number> {
    const table = RESOURCE_TABLES[resourceType];
    if (!table) throw badRequest("Unsupported resource type");
    const resources = this.db.select({ id: table.id }).from(table).where(eq(table.userId, userId)).all();
    for (const resource of resources) {
      await this.deleteResource(userId, resourceType, resource.id);
    }
    return resources.length;
  }

  listSummariesForResource(userId: string, resourceType: ResourceType, resourceId: string) {
    return this.db
      .select()
      .from(summaryArtifacts)
      .where(and(eq(summaryArtifacts.userId, userId), eq(summaryArtifacts.resourceType, resourceType), eq(summaryArtifacts.resourceId, resourceId)))
      .orderBy(summaryArtifacts.createdAt)
      .all();
  }

  async summarizeResource(userId: string, resourceType: ResourceType, resourceId: string) {
    const resource = this.getResource(userId, resourceType, resourceId);
    const transcript = this.getForResource(userId, resourceType, resourceId);
    const bundle = await generateSummaryBundle(this.llm, userId, resourceType, resource.name, transcript.content);

    const existing = this.listSummariesForResource(userId, resourceType, resourceId);
    const byType = new Map(existing.map((item) => [item.summaryType, item]));
    const now = new Date().toISOString();

    const summaryRow = byType.get("summary");
    if (summaryRow) {
      this.db.update(summaryArtifacts).set({ content: bundle.summary, data: {}, status: "completed", updatedAt: now }).where(eq(summaryArtifacts.id, summaryRow.id)).run();
    } else {
      this.db
        .insert(summaryArtifacts)
        .values({
          id: randomUUID(),
          userId,
          resourceType,
          resourceId,
          summaryType: "summary",
          content: bundle.summary,
          data: {},
          status: "completed",
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }

    const keyPointsRow = byType.get("key_points");
    if (keyPointsRow) {
      this.db
        .update(summaryArtifacts)
        .set({ content: "", data: { items: bundle.keyPoints }, status: "completed", updatedAt: now })
        .where(eq(summaryArtifacts.id, keyPointsRow.id))
        .run();
    } else {
      this.db
        .insert(summaryArtifacts)
        .values({
          id: randomUUID(),
          userId,
          resourceType,
          resourceId,
          summaryType: "key_points",
          content: "",
          data: { items: bundle.keyPoints },
          status: "completed",
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }

    if (resourceType === "document") {
      this.db.update(documents).set({ summary: bundle.summary, updatedAt: now }).where(eq(documents.id, resourceId)).run();
    } else if (resourceType === "video") {
      this.db.update(videos).set({ summary: bundle.summary, chapters: bundle.chapters, actionItems: bundle.actionItems, updatedAt: now }).where(eq(videos.id, resourceId)).run();
    }

    return this.listSummariesForResource(userId, resourceType, resourceId);
  }

  async queryResource(userId: string, resourceType: ResourceType, resourceId: string, question: string): Promise<string> {
    const resource = this.getResource(userId, resourceType, resourceId);
    const transcript = this.getForResource(userId, resourceType, resourceId);
    const summaries = this.listSummariesForResource(userId, resourceType, resourceId);

    const searchResults = await this.search.search(userId, question, { sourceType: resourceType, sourceIds: new Set([resourceId]), limit: 5 });
    const relevantContext = searchResults
      .flatMap((result) => result.chunks.slice(0, 2).map((hit) => `[${formatCitation(resource.name, hit.chunk.meta)}]\n${hit.chunk.content}`))
      .join("\n\n")
      .trim();

    let summaryText = "";
    let keyPointsText = "";
    for (const item of summaries) {
      if (item.summaryType === "summary" && item.content) summaryText = item.content;
      if (item.summaryType === "key_points") {
        const points = (item.data as { items?: unknown }).items;
        if (Array.isArray(points)) {
          keyPointsText = points
            .filter((point): point is string => typeof point === "string")
            .map((point) => `- ${point}`)
            .join("\n");
        }
      }
    }

    const promptParts = [`Resource: ${resource.name}`, `Type: ${resourceType}`];
    if (summaryText) promptParts.push(`Summary:\n${summaryText}`);
    if (keyPointsText) promptParts.push(`Key points:\n${keyPointsText}`);
    if (relevantContext) {
      promptParts.push(`Relevant excerpts:\n${relevantContext}`);
    } else {
      promptParts.push(`Transcript:\n${transcript.content.slice(0, MAX_LLM_SOURCE_CHARS)}`);
    }
    promptParts.push(`Question: ${question}`);

    const { model, provider } = this.llm.resolveModelAndProvider(userId, null);
    return this.llm.generateReply(provider, model, [
      {
        role: "system",
        content: "Answer using the provided resource transcript, summary, and excerpts. Prefer direct evidence from the material and say when the answer is uncertain.",
      },
      { role: "user", content: promptParts.join("\n\n") },
    ]);
  }

  async queryTranscript(userId: string, transcriptId: string, question: string): Promise<string> {
    const transcript = this.db.select().from(transcripts).where(eq(transcripts.id, transcriptId)).get();
    if (!transcript || transcript.userId !== userId) throw notFound("Transcript not found");

    const { model, provider } = this.llm.resolveModelAndProvider(userId, null);
    return this.llm.generateReply(provider, model, [
      { role: "system", content: "Answer using only the transcript content provided. Be concise and factual." },
      { role: "user", content: `Transcript:\n${transcript.content}\n\nQuestion: ${question}` },
    ]);
  }
}
