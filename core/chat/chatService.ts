import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

import { and, asc, eq, gt, ne } from "drizzle-orm";

import { WorkspaceService } from "../auth/workspaceService.js";
import type { ChikaimaDatabase } from "../db/client.js";
import { aiModels, audioAssets, conversations, documents, messages, transcripts, videos } from "../db/schema.js";
import { badRequest, notFound } from "../errors.js";
import type { ChatMessage, MessageContentPart } from "../providers/types.js";
import { monotonicIsoTimestamp } from "../util/monotonicTimestamp.js";
import { LLMService, type AIModelRow, type ProviderRow, type RagCitation } from "./llmService.js";

export type ConversationRow = typeof conversations.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;

type AudioRow = typeof audioAssets.$inferSelect;
type VideoRow = typeof videos.$inferSelect;
type DocumentRow = typeof documents.$inferSelect;
type AttachableResource = AudioRow | VideoRow | DocumentRow;

const MAX_ATTACHMENT_CONTEXT_CHARS = 8_000;
const MAX_ATTACHMENT_ITEM_CHARS = 2_500;

interface AttachmentRef {
  id: string;
  kind: "document" | "audio" | "video";
  name?: string;
}

export interface ConversationCreateInput {
  title: string;
  folder?: string | null;
  modelId?: string | null;
  initialMessage?: string | null;
  initialMetadata?: Record<string, unknown>;
}

export interface MessageCreateInput {
  role: "system" | "user" | "assistant";
  content: string;
  metadata?: Record<string, unknown>;
}

export interface MessageResponse {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ConversationResponse {
  id: string;
  title: string;
  folder: string | null;
  model_id: string | null;
  messages: MessageResponse[];
  created_at: string;
  updated_at: string;
}

export interface StreamChatInput {
  content: string;
  conversationId?: string | null;
  title?: string | null;
  modelId?: string | null;
  metadata?: Record<string, unknown>;
  useRag?: boolean;
}

export type ChatStreamEvent =
  | {
      type: "metadata";
      conversationId: string;
      userMessageId: string;
      provider: string;
      model: string;
      ragCitations: RagCitation[];
      processingBlocked: boolean;
    }
  | { type: "token"; text: string }
  | { type: "done" }
  | { type: "error"; detail: string };

export function toMessageResponse(row: MessageRow): MessageResponse {
  return {
    id: row.id,
    conversation_id: row.conversationId,
    role: row.role,
    content: row.content,
    status: row.status,
    metadata: row.meta as Record<string, unknown>,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export function toConversationResponse(row: ConversationRow, conversationMessages: MessageRow[]): ConversationResponse {
  return {
    id: row.id,
    title: row.title,
    folder: row.folder,
    model_id: row.modelId,
    messages: conversationMessages.map(toMessageResponse),
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export class ChatService {
  readonly llm: LLMService;

  constructor(private readonly db: ChikaimaDatabase) {
    this.llm = new LLMService(db);
  }

  listConversations(userId: string): Array<{ conversation: ConversationRow; messages: MessageRow[] }> {
    const rows = this.db.select().from(conversations).where(eq(conversations.userId, userId)).all();
    rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return rows.map((conversation) => ({ conversation, messages: this.messagesFor(conversation.id) }));
  }

  getConversation(conversationId: string): ConversationRow | undefined {
    return this.db.select().from(conversations).where(eq(conversations.id, conversationId)).get();
  }

  messagesFor(conversationId: string): MessageRow[] {
    return this.db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(asc(messages.createdAt)).all();
  }

  deleteConversation(userId: string, conversationId: string): void {
    const conversation = this.getConversation(conversationId);
    if (!conversation || conversation.userId !== userId) {
      throw notFound("Conversation not found");
    }
    // Mirrors the Python model's `messages = relationship(..., cascade="all, delete-orphan")`.
    this.db.delete(messages).where(eq(messages.conversationId, conversationId)).run();
    this.db.delete(conversations).where(eq(conversations.id, conversationId)).run();
  }

  async createConversation(userId: string, payload: ConversationCreateInput, useRag = true): Promise<ConversationRow> {
    const { model, provider } = await this.resolveChatModelAndProvider(userId, payload.modelId ?? null, payload.initialMetadata ?? {});
    const now = new Date().toISOString();
    const conversation: ConversationRow = {
      id: randomUUID(),
      userId,
      title: payload.title,
      folder: payload.folder ?? null,
      modelId: model.id,
      createdAt: now,
      updatedAt: now,
    };
    this.db.insert(conversations).values(conversation).run();

    if (payload.initialMessage) {
      const userMessage = this.insertMessage(conversation.id, "user", payload.initialMessage, { source: "initial", ...(payload.initialMetadata ?? {}) });
      await this.respondTo(userId, conversation, [userMessage], provider, model, useRag);
    }

    return this.getConversation(conversation.id)!;
  }

  async addMessage(userId: string, conversationId: string, payload: MessageCreateInput, useRag = true): Promise<MessageRow> {
    const conversation = this.getConversation(conversationId);
    if (!conversation || conversation.userId !== userId) {
      throw notFound("Conversation not found");
    }
    if (payload.role !== "user") {
      throw badRequest("Only user messages can be posted directly.");
    }

    const { model, provider } = await this.resolveChatModelAndProvider(userId, conversation.modelId, payload.metadata ?? {});
    const message = this.insertMessage(conversationId, payload.role, payload.content, { ...(payload.metadata ?? {}), provider: provider.providerType, model: model.modelKey });

    const history = [...this.messagesFor(conversationId).filter((m) => m.id !== message.id), message];
    await this.respondTo(userId, conversation, history, provider, model, useRag);

    return this.db.select().from(messages).where(eq(messages.id, message.id)).get()!;
  }

  async updateMessage(userId: string, messageId: string, content: string, useRag = true): Promise<MessageRow> {
    const message = this.db.select().from(messages).where(eq(messages.id, messageId)).get();
    if (!message) throw notFound("Message not found");
    const conversation = this.getConversation(message.conversationId);
    if (!conversation || conversation.userId !== userId) throw notFound("Message not found");

    const now = new Date().toISOString();
    this.db
      .update(messages)
      .set({ content, meta: { ...(message.meta as Record<string, unknown>), edited: true }, updatedAt: now })
      .where(eq(messages.id, messageId))
      .run();

    if (message.role === "user") {
      this.db.delete(messages).where(and(eq(messages.conversationId, message.conversationId), ne(messages.id, messageId), gt(messages.createdAt, message.createdAt))).run();

      const { model, provider } = await this.resolveChatModelAndProvider(userId, conversation.modelId, message.meta as Record<string, unknown>);
      const history = this.messagesFor(message.conversationId).filter((item) => item.createdAt <= message.createdAt);
      await this.respondTo(userId, conversation, history, provider, model, useRag);
    }

    return this.db.select().from(messages).where(eq(messages.id, messageId)).get()!;
  }

  async regenerateMessage(userId: string, messageId: string, useRag = true): Promise<MessageRow> {
    const message = this.db.select().from(messages).where(eq(messages.id, messageId)).get();
    if (!message) throw notFound("Message not found");
    const conversation = this.getConversation(message.conversationId);
    if (!conversation || conversation.userId !== userId) throw notFound("Message not found");

    const { model, provider } = await this.resolveChatModelAndProvider(userId, conversation.modelId, message.meta as Record<string, unknown>);

    const allMessages = this.messagesFor(message.conversationId);
    const history = allMessages.filter((item) => {
      if (item.id === message.id) return false;
      if (message.role === "assistant" && item.createdAt > message.createdAt) return false;
      return true;
    });

    const pendingNotice = this.buildPendingAttachmentNotice(userId, history);
    let assistantContent: string;
    let citations: RagCitation[] = [];
    let meta: Record<string, unknown>;

    if (pendingNotice) {
      assistantContent = pendingNotice;
      meta = { regenerated_from: message.id, provider: provider.providerType, model: model.modelKey, processing_blocked: true, rag_citations: [] };
    } else {
      const serialized = await this.serializeMessages(userId, history, model);
      if (useRag) {
        const ragScope = this.collectRagSourceFilters(history);
        const result = await this.llm.generateReplyWithRag({ userId, provider, model, messages: serialized, sourceFilters: ragScope });
        assistantContent = result.content;
        citations = result.citations;
        meta = { regenerated_from: message.id, provider: provider.providerType, model: model.modelKey, rag_citations: citations };
      } else {
        assistantContent = await this.llm.generateReply(provider, model, serialized);
        meta = { regenerated_from: message.id, provider: provider.providerType, model: model.modelKey };
      }
    }

    return this.insertMessage(message.conversationId, "assistant", assistantContent, meta);
  }

  /**
   * Streams the assistant reply token-by-token, yielding a structured event
   * sequence: one `metadata` event, then `token` events, then `done` (or
   * `error` if generation fails after the user message was already
   * persisted). The route handler is responsible for SSE wire formatting —
   * this only carries the business logic, mirroring the Python endpoint's
   * `event_stream()` generator without the `text/event-stream` framing.
   */
  async *streamChat(userId: string, input: StreamChatInput): AsyncGenerator<ChatStreamEvent> {
    const useRag = input.useRag ?? true;
    let conversation: ConversationRow;
    let history: MessageRow[];
    let model: AIModelRow;
    let provider: ProviderRow;

    if (input.conversationId) {
      const existing = this.getConversation(input.conversationId);
      if (!existing || existing.userId !== userId) {
        throw notFound("Conversation not found");
      }
      conversation = existing;
      const selectedModelId = input.modelId ?? conversation.modelId;
      const { model: selectedModel } = this.llm.resolveModelAndProvider(userId, selectedModelId);
      if (conversation.modelId !== selectedModel.id) {
        this.db.update(conversations).set({ modelId: selectedModel.id }).where(eq(conversations.id, conversation.id)).run();
        conversation = { ...conversation, modelId: selectedModel.id };
      }
      ({ model, provider } = await this.resolveChatModelAndProvider(userId, selectedModelId, input.metadata ?? {}));
      history = this.messagesFor(conversation.id);
    } else {
      const { model: selectedModel } = this.llm.resolveModelAndProvider(userId, input.modelId ?? null);
      ({ model, provider } = await this.resolveChatModelAndProvider(userId, input.modelId ?? null, input.metadata ?? {}));
      const now = new Date().toISOString();
      conversation = {
        id: randomUUID(),
        userId,
        title: (input.title || input.content).trim().slice(0, 48) || "New analysis",
        folder: null,
        modelId: selectedModel.id,
        createdAt: now,
        updatedAt: now,
      };
      this.db.insert(conversations).values(conversation).run();
      history = [];
    }

    const userMessage = this.insertMessage(conversation.id, "user", input.content, input.metadata ?? {});
    this.db.update(conversations).set({ updatedAt: new Date().toISOString() }).where(eq(conversations.id, conversation.id)).run();

    const messageHistory = [...history, userMessage];
    const pendingNotice = this.buildPendingAttachmentNotice(userId, messageHistory);
    let citations: RagCitation[] = [];
    let stream: AsyncIterable<string>;

    if (pendingNotice) {
      stream = (async function* () {
        yield pendingNotice;
      })();
    } else {
      const result = await this.llm.streamReplyWithRag({
        userId,
        provider,
        model,
        messages: await this.serializeMessages(userId, messageHistory, model),
        includeContext: useRag,
        sourceFilters: this.collectRagSourceFilters(messageHistory),
      });
      stream = result.stream;
      citations = result.citations;
    }

    yield {
      type: "metadata",
      conversationId: conversation.id,
      userMessageId: userMessage.id,
      provider: provider.providerType,
      model: model.modelKey,
      ragCitations: citations,
      processingBlocked: Boolean(pendingNotice),
    };

    const assistantParts: string[] = [];
    try {
      for await (const chunk of stream) {
        assistantParts.push(chunk);
        yield { type: "token", text: chunk };
      }
      const assistantContent = assistantParts.join("").trim();
      if (assistantContent) {
        this.insertMessage(conversation.id, "assistant", assistantContent, {
          provider: provider.providerType,
          model: model.modelKey,
          rag_citations: citations,
          processing_blocked: Boolean(pendingNotice),
        });
        this.db.update(conversations).set({ updatedAt: new Date().toISOString() }).where(eq(conversations.id, conversation.id)).run();
      }
      yield { type: "done" };
    } catch (error) {
      yield { type: "error", detail: error instanceof Error ? error.message : String(error) };
    }
  }

  /** Generates and persists the assistant reply for `history`, appended to `conversation`. Shared by create/add/update. */
  private async respondTo(userId: string, conversation: ConversationRow, history: MessageRow[], provider: ProviderRow, model: AIModelRow, useRag: boolean): Promise<void> {
    const pendingNotice = this.buildPendingAttachmentNotice(userId, history);
    let assistantContent: string;
    let meta: Record<string, unknown>;

    if (pendingNotice) {
      assistantContent = pendingNotice;
      meta = { provider: provider.providerType, model: model.modelKey, processing_blocked: true, rag_citations: [] };
    } else if (useRag) {
      const ragScope = this.collectRagSourceFilters(history);
      const result = await this.llm.generateReplyWithRag({ userId, provider, model, messages: await this.serializeMessages(userId, history, model), sourceFilters: ragScope });
      meta = { provider: provider.providerType, model: model.modelKey, rag_citations: result.citations };
      assistantContent = result.content;
    } else {
      assistantContent = await this.llm.generateReply(provider, model, await this.serializeMessages(userId, history, model));
      meta = { provider: provider.providerType, model: model.modelKey };
    }

    this.insertMessage(conversation.id, "assistant", assistantContent, meta);
    this.db.update(conversations).set({ updatedAt: new Date().toISOString() }).where(eq(conversations.id, conversation.id)).run();
  }

  private insertMessage(conversationId: string, role: string, content: string, meta: Record<string, unknown>): MessageRow {
    const now = monotonicIsoTimestamp();
    const row: MessageRow = { id: randomUUID(), conversationId, role, content, status: "completed", meta, createdAt: now, updatedAt: now };
    this.db.insert(messages).values(row).run();
    return row;
  }

  async serializeMessages(userId: string, history: MessageRow[], model: AIModelRow): Promise<ChatMessage[]> {
    const built: ChatMessage[] = [];
    for (const message of history) {
      built.push({ role: message.role, content: await this.buildMessageContent(userId, message, model) });
    }
    return built;
  }

  private async buildMessageContent(userId: string, message: MessageRow, model: AIModelRow): Promise<ChatMessage["content"]> {
    const baseContent = message.content;
    if (message.role !== "user") return baseContent;

    const meta = message.meta as Record<string, unknown>;
    const attachmentContext = this.buildAttachmentContext(userId, meta);
    const visionParts = await this.buildImageParts(userId, meta, model);
    if (!attachmentContext && visionParts.length === 0) return baseContent;

    let textContent = baseContent;
    if (attachmentContext) {
      textContent = `${baseContent}\n\nAttached resources for this message:\n${attachmentContext}\n\nUse the attached resource context when it is relevant to the user's request.`;
    } else if (visionParts.length > 0) {
      textContent = `${baseContent}\n\nAn image is attached to this message. Analyze it directly when that helps answer the user's request.`;
    }
    if (visionParts.length === 0) return textContent;
    return [{ type: "text", text: textContent }, ...visionParts];
  }

  private buildAttachmentContext(userId: string, metadata: Record<string, unknown>): string {
    const attachments = this.attachmentsFrom(metadata);
    if (attachments.length === 0) return "";

    const sections: string[] = [];
    let remaining = MAX_ATTACHMENT_CONTEXT_CHARS;
    for (const attachment of attachments) {
      if (remaining <= 0) break;
      const section = this.buildAttachmentSection(userId, attachment).slice(0, MAX_ATTACHMENT_ITEM_CHARS).trim();
      if (!section) continue;
      sections.push(section);
      remaining -= section.length;
    }
    return sections.join("\n\n");
  }

  private async buildImageParts(userId: string, metadata: Record<string, unknown>, model: AIModelRow): Promise<MessageContentPart[]> {
    const capabilities = model.capabilities as Record<string, boolean> | null;
    if (!capabilities?.vision) return [];
    const attachments = this.attachmentsFrom(metadata).filter((a) => a.kind === "document");

    const parts: MessageContentPart[] = [];
    for (const attachment of attachments) {
      const resource = this.db.select().from(documents).where(eq(documents.id, attachment.id)).get();
      if (!resource || resource.userId !== userId || !resource.mimeType.startsWith("image/")) continue;

      try {
        const data = (await readFile(resource.filePath)).toString("base64");
        parts.push({ type: "image", mime_type: resource.mimeType, data });
      } catch {
        // Attachment file is unreadable (e.g. deleted from disk out-of-band); skip it silently.
      }
    }
    return parts;
  }

  private async resolveChatModelAndProvider(userId: string, modelId: string | null, metadata: Record<string, unknown>): Promise<{ model: AIModelRow; provider: ProviderRow }> {
    const { model, provider } = this.llm.resolveModelAndProvider(userId, modelId);
    if (!this.shouldAutoUseVisionModel(userId, metadata, model)) {
      return { model, provider };
    }
    const visionModel = this.findSameProviderVisionModel(model.providerId);
    return visionModel ? { model: visionModel, provider } : { model, provider };
  }

  private shouldAutoUseVisionModel(userId: string, metadata: Record<string, unknown>, model: AIModelRow): boolean {
    const workspace = new WorkspaceService(this.db).getOrCreate();
    if (!workspace.visionAware) return false;
    if ((model.capabilities as Record<string, boolean> | null)?.vision) return false;
    return this.hasImageAttachment(userId, metadata);
  }

  private hasImageAttachment(userId: string, metadata: Record<string, unknown>): boolean {
    return this.attachmentsFrom(metadata)
      .filter((a) => a.kind === "document")
      .some((attachment) => {
        const resource = this.db.select().from(documents).where(eq(documents.id, attachment.id)).get();
        return Boolean(resource && resource.userId === userId && resource.mimeType.startsWith("image/"));
      });
  }

  private findSameProviderVisionModel(providerId: string): AIModelRow | undefined {
    const candidates = this.db
      .select()
      .from(aiModels)
      .where(and(eq(aiModels.providerId, providerId), eq(aiModels.isAvailable, true)))
      .all();
    candidates.sort((a, b) => (a.isDefault === b.isDefault ? a.createdAt.localeCompare(b.createdAt) : a.isDefault ? -1 : 1));
    return candidates.find((candidate) => (candidate.capabilities as Record<string, boolean> | null)?.vision);
  }

  private buildPendingAttachmentNotice(userId: string, history: MessageRow[]): string | null {
    const pending = this.collectPendingAttachments(userId, history);
    if (pending.length === 0) return null;

    if (pending.length === 1) {
      const item = pending[0]!;
      if (item.kind === "video" || item.kind === "audio") {
        return `I can see you've uploaded "${item.name}", but the transcription is still processing.\n\nPlease give it a moment to finish, and I'll be able to help with that ${item.kind} once it's complete.`;
      }
      return `I can see you've uploaded "${item.name}", but it is still processing.\n\nPlease give it a moment to finish, and I'll be able to help once it's complete.`;
    }

    const lines = pending.map((item) => `- ${item.name} (${item.kind}, ${item.status})`);
    return `Some attached files are still processing, so I can't work from them yet.\n\n${lines.join("\n")}\n\nPlease wait for processing to finish, then try again.`;
  }

  /**
   * Returns `undefined` (not `{}`) when no message in `history` references an
   * attachment, so RAG search runs unrestricted across the whole library.
   * The Python original always returns `{}` here and `AssetSearchService`
   * treats an empty-but-present filter dict as "nothing matched" rather than
   * "no restriction" — meaning general RAG search (no @-mentioned file)
   * silently never ran there. That reads as an unintentional defect, not a
   * deliberate restriction, so it's fixed here rather than ported as-is.
   */
  private collectRagSourceFilters(history: MessageRow[]): Record<string, Set<string>> | undefined {
    const filters: Record<string, Set<string>> = {};
    for (const message of history) {
      for (const attachment of this.attachmentsFrom(message.meta as Record<string, unknown>)) {
        filters[attachment.kind] ??= new Set();
        filters[attachment.kind]!.add(attachment.id);
      }
    }
    return Object.keys(filters).length > 0 ? filters : undefined;
  }

  private collectPendingAttachments(userId: string, history: MessageRow[]): Array<{ id: string; kind: string; name: string; status: string }> {
    const pending: Array<{ id: string; kind: string; name: string; status: string }> = [];
    const seen = new Set<string>();

    for (const message of history) {
      for (const attachment of this.attachmentsFrom(message.meta as Record<string, unknown>)) {
        const key = `${attachment.kind}:${attachment.id}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const resource = this.getResourceRow(attachment.kind, attachment.id);
        if (!resource || resource.userId !== userId) continue;
        if (resource.status === "completed") continue;
        pending.push({ id: attachment.id, kind: attachment.kind, name: resource.name ?? attachment.name ?? "Attachment", status: resource.status });
      }
    }
    return pending;
  }

  private buildAttachmentSection(userId: string, attachment: AttachmentRef): string {
    const displayName = attachment.name || "Attachment";
    const resource = this.getResourceRow(attachment.kind, attachment.id);
    if (!resource || resource.userId !== userId) {
      return `${displayName} (${attachment.kind}) could not be loaded.`;
    }

    const transcript = this.latestTranscript(userId, attachment.kind, attachment.id);

    if (attachment.kind === "document" && isDocumentRow(resource) && resource.mimeType.startsWith("image/")) {
      const label = `Image attachment: ${resource.name}`;
      if (resource.status !== "completed") return `${label}\nStatus: ${resource.status}. OCR/analysis may still be processing.`;
      const ocrText = (transcript?.content ?? "").trim();
      if (ocrText) return `${label}\nExtracted text:\n${ocrText}`;
      if (resource.summary) return `${label}\nSummary:\n${resource.summary}`;
      return `${label}\nNo extracted text is available yet.`;
    }

    if (attachment.kind === "document" && isDocumentRow(resource)) {
      const label = `Document attachment: ${resource.name}`;
      if (resource.status !== "completed") return `${label}\nStatus: ${resource.status}. Document analysis may still be processing.`;
      const parts = [label];
      if (resource.summary) parts.push(`Summary:\n${resource.summary.trim()}`);
      if (transcript?.content) parts.push(`Extracted content:\n${transcript.content.trim()}`);
      return parts.join("\n");
    }

    if (attachment.kind === "audio" && isAudioRow(resource)) {
      const label = `Audio attachment: ${resource.name}`;
      if (resource.status !== "completed") return `${label}\nStatus: ${resource.status}. Transcription may still be processing.`;
      const transcriptText = (resource.transcript || transcript?.content || "").trim();
      return `${label}\nTranscript:\n${transcriptText || "No transcript is available yet."}`;
    }

    if (attachment.kind === "video" && isVideoRow(resource)) {
      const label = `Video attachment: ${resource.name}`;
      if (resource.status !== "completed") return `${label}\nStatus: ${resource.status}. Transcription may still be processing.`;
      const transcriptText = (resource.transcript || transcript?.content || "").trim();
      const parts = [label];
      if (resource.summary) parts.push(`Summary:\n${resource.summary.trim()}`);
      parts.push(`Transcript:\n${transcriptText || "No transcript is available yet."}`);
      return parts.join("\n");
    }

    return "";
  }

  private getResourceRow(kind: string, id: string): AttachableResource | undefined {
    if (kind === "document") return this.db.select().from(documents).where(eq(documents.id, id)).get();
    if (kind === "audio") return this.db.select().from(audioAssets).where(eq(audioAssets.id, id)).get();
    if (kind === "video") return this.db.select().from(videos).where(eq(videos.id, id)).get();
    return undefined;
  }

  private latestTranscript(userId: string, resourceType: string, resourceId: string) {
    return this.db
      .select()
      .from(transcripts)
      .where(and(eq(transcripts.userId, userId), eq(transcripts.resourceType, resourceType), eq(transcripts.resourceId, resourceId)))
      .orderBy(asc(transcripts.createdAt))
      .all()
      .at(-1);
  }

  private attachmentsFrom(metadata: Record<string, unknown> | null | undefined): AttachmentRef[] {
    const attachments = metadata?.attachments;
    if (!Array.isArray(attachments)) return [];
    return attachments
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .filter((item) => typeof item.id === "string" && ["document", "audio", "video"].includes(String(item.kind)))
      .map((item) => ({ id: item.id as string, kind: item.kind as AttachmentRef["kind"], name: typeof item.name === "string" ? item.name : undefined }));
  }
}

function isDocumentRow(resource: AttachableResource): resource is DocumentRow {
  return "mimeType" in resource;
}

function isAudioRow(resource: AttachableResource): resource is AudioRow {
  return !("mimeType" in resource) && !("chapters" in resource);
}

function isVideoRow(resource: AttachableResource): resource is VideoRow {
  return "chapters" in resource;
}
