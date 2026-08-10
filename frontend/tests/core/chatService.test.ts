import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { eq } from "drizzle-orm";

import { AuthService } from "../../core/auth/authService.js";
import { ChatService, toConversationResponse } from "../../core/chat/chatService.js";
import { __resetConfigForTests } from "../../core/config/index.js";
import { __resetSecretManagerForTests } from "../../core/crypto/index.js";
import { getDb, __resetDbForTests } from "../../core/db/client.js";
import { audioAssets, conversations, documents, messages } from "../../core/db/schema.js";
import { EmbeddingsService } from "../../core/embeddings/embeddingsService.js";
import { HttpError } from "../../core/errors.js";
import { ProviderService } from "../../core/providers/providerService.js";

async function withTempDb<T>(fn: (workDir: string) => T | Promise<T>): Promise<T> {
  const dbDir = mkdtempSync(join(tmpdir(), "chikaima-chat-db-"));
  const workDir = mkdtempSync(join(tmpdir(), "chikaima-chat-work-"));
  const previous = process.env.CHIKAIMA_DB_PATH;
  process.env.CHIKAIMA_DB_PATH = join(dbDir, "test.db");
  __resetConfigForTests();
  __resetDbForTests();
  __resetSecretManagerForTests();
  try {
    return await fn(workDir);
  } finally {
    __resetDbForTests();
    __resetConfigForTests();
    __resetSecretManagerForTests();
    if (previous === undefined) delete process.env.CHIKAIMA_DB_PATH;
    else process.env.CHIKAIMA_DB_PATH = previous;
    rmSync(dbDir, { recursive: true, force: true });
    rmSync(workDir, { recursive: true, force: true });
  }
}

async function createOpenAiProvider(userId: string): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("unauthorized", { status: 401 })) as typeof fetch;
  try {
    await new ProviderService(getDb()).create(userId, { name: "OpenAI", providerType: "openai", apiKey: "sk-test" });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function withMockedFetch<T>(handler: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

function chatCompletionFetch(reply: string): typeof fetch {
  return (async () => new Response(JSON.stringify({ choices: [{ message: { content: reply } }] }), { status: 200 })) as typeof fetch;
}

test("createConversation with an initial message produces a user + assistant message pair", async () => {
  await withTempDb(async () => {
    const db = getDb();
    const user = new AuthService(db).register({ email: "user@example.com", fullName: "User", password: "password123" });
    await createOpenAiProvider(user.id);

    const conversation = await withMockedFetch(chatCompletionFetch("Hello back!"), () =>
      new ChatService(db).createConversation(user.id, { title: "Chat 1", initialMessage: "Hello" }, false),
    );

    const msgs = db.select().from(messages).where(eq(messages.conversationId, conversation.id)).all();
    assert.equal(msgs.length, 2);
    assert.equal(msgs[0]?.role, "user");
    assert.equal(msgs[0]?.content, "Hello");
    assert.equal(msgs[1]?.role, "assistant");
    assert.equal(msgs[1]?.content, "Hello back!");
  });
});

test("addMessage rejects a non-user role", async () => {
  await withTempDb(async () => {
    const db = getDb();
    const user = new AuthService(db).register({ email: "user@example.com", fullName: "User", password: "password123" });
    await createOpenAiProvider(user.id);
    const conversation = await withMockedFetch(chatCompletionFetch("hi"), () => new ChatService(db).createConversation(user.id, { title: "Chat" }, false));

    await assert.rejects(
      () => new ChatService(db).addMessage(user.id, conversation.id, { role: "assistant", content: "not allowed" }, false),
      (e: unknown) => e instanceof HttpError && e.statusCode === 400,
    );
  });
});

test("addMessage on a conversation owned by another user is not found", async () => {
  await withTempDb(async () => {
    const db = getDb();
    const owner = new AuthService(db).register({ email: "owner@example.com", fullName: "Owner", password: "password123" });
    const other = new AuthService(db).register({ email: "other@example.com", fullName: "Other", password: "password123" });
    await createOpenAiProvider(owner.id);
    const conversation = await withMockedFetch(chatCompletionFetch("hi"), () => new ChatService(db).createConversation(owner.id, { title: "Chat" }, false));

    await assert.rejects(
      () => new ChatService(db).addMessage(other.id, conversation.id, { role: "user", content: "hijack" }, false),
      (e: unknown) => e instanceof HttpError && e.statusCode === 404,
    );
  });
});

test("deleteConversation removes every message in it (cascade)", async () => {
  await withTempDb(async () => {
    const db = getDb();
    const user = new AuthService(db).register({ email: "user@example.com", fullName: "User", password: "password123" });
    await createOpenAiProvider(user.id);
    const service = new ChatService(db);
    const conversation = await withMockedFetch(chatCompletionFetch("hi"), () => service.createConversation(user.id, { title: "Chat", initialMessage: "hello" }, false));
    assert.ok(db.select().from(messages).where(eq(messages.conversationId, conversation.id)).all().length > 0);

    service.deleteConversation(user.id, conversation.id);

    assert.equal(db.select().from(conversations).where(eq(conversations.id, conversation.id)).get(), undefined);
    assert.equal(db.select().from(messages).where(eq(messages.conversationId, conversation.id)).all().length, 0);
  });
});

test("updateMessage on a user message re-generates the reply and drops any later messages", async () => {
  await withTempDb(async () => {
    const db = getDb();
    const user = new AuthService(db).register({ email: "user@example.com", fullName: "User", password: "password123" });
    await createOpenAiProvider(user.id);
    const service = new ChatService(db);
    const conversation = await withMockedFetch(chatCompletionFetch("first reply"), () => service.createConversation(user.id, { title: "Chat", initialMessage: "first question" }, false));

    const userMessage = db.select().from(messages).where(eq(messages.conversationId, conversation.id)).all()[0]!;

    const updated = await withMockedFetch(chatCompletionFetch("second reply"), () => service.updateMessage(user.id, userMessage.id, "edited question", false));
    assert.equal(updated.content, "edited question");
    assert.equal((updated.meta as { edited?: boolean }).edited, true);

    const afterEdit = db.select().from(messages).where(eq(messages.conversationId, conversation.id)).all();
    assert.equal(afterEdit.length, 2);
    assert.equal(afterEdit[1]?.content, "second reply");
  });
});

test("regenerateMessage on an assistant message produces a new assistant message referencing the original", async () => {
  await withTempDb(async () => {
    const db = getDb();
    const user = new AuthService(db).register({ email: "user@example.com", fullName: "User", password: "password123" });
    await createOpenAiProvider(user.id);
    const service = new ChatService(db);
    const conversation = await withMockedFetch(chatCompletionFetch("original reply"), () => service.createConversation(user.id, { title: "Chat", initialMessage: "question" }, false));
    const assistantMessage = db.select().from(messages).where(eq(messages.conversationId, conversation.id)).all()[1]!;

    const regenerated = await withMockedFetch(chatCompletionFetch("regenerated reply"), () => service.regenerateMessage(user.id, assistantMessage.id, false));

    assert.equal(regenerated.content, "regenerated reply");
    assert.equal((regenerated.meta as { regenerated_from?: string }).regenerated_from, assistantMessage.id);
  });
});

test("a message referencing a still-processing attachment gets a pending notice instead of calling the LLM", async () => {
  await withTempDb(async (workDir) => {
    const db = getDb();
    const user = new AuthService(db).register({ email: "user@example.com", fullName: "User", password: "password123" });
    await createOpenAiProvider(user.id);

    const now = new Date().toISOString();
    db.insert(audioAssets).values({ id: "audio-1", userId: user.id, name: "clip.mp3", filePath: join(workDir, "clip.mp3"), status: "processing", createdAt: now, updatedAt: now }).run();

    const service = new ChatService(db);
    let fetchCalled = false;
    const conversation = await withMockedFetch(
      (async () => {
        fetchCalled = true;
        throw new Error("should not be called while attachment is pending");
      }) as typeof fetch,
      () =>
        service.createConversation(
          user.id,
          { title: "Chat", initialMessage: "what's in this audio?", initialMetadata: { attachments: [{ id: "audio-1", kind: "audio", name: "clip.mp3" }] } },
          false,
        ),
    );

    assert.equal(fetchCalled, false);
    const assistantMessage = db.select().from(messages).where(eq(messages.conversationId, conversation.id)).all()[1]!;
    assert.match(assistantMessage.content, /clip\.mp3/);
    assert.match(assistantMessage.content, /still processing/);
    assert.equal((assistantMessage.meta as { processing_blocked?: boolean }).processing_blocked, true);
  });
});

test("addMessage with RAG enabled includes citations from indexed chunks in the assistant message metadata", async () => {
  await withTempDb(async (workDir) => {
    const db = getDb();
    const user = new AuthService(db).register({ email: "user@example.com", fullName: "User", password: "password123" });
    await createOpenAiProvider(user.id);

    const now = new Date().toISOString();
    db.insert(documents).values({ id: "doc-1", userId: user.id, name: "handbook.pdf", filePath: join(workDir, "handbook.pdf"), mimeType: "application/pdf", status: "completed", createdAt: now, updatedAt: now }).run();

    await withMockedFetch(
      (async () => new Response(JSON.stringify({ data: [{ embedding: [1, 0, 0] }] }), { status: 200 })) as typeof fetch,
      () =>
        new EmbeddingsService(db).replaceChunksForSource({
          userId: user.id,
          sourceType: "document",
          sourceId: "doc-1",
          assetType: "document",
          filename: "handbook.pdf",
          chunks: [{ content: "vacation policy is 20 days per year", metadata: { page: 3 } }],
        }),
    );

    const service = new ChatService(db);
    const conversation = await withMockedFetch(chatCompletionFetch("setup"), () => service.createConversation(user.id, { title: "Chat" }, false));

    const mockFetch = (async (url: RequestInfo | URL) => {
      const href = String(url instanceof URL ? url.href : typeof url === "string" ? url : url.url);
      if (href.includes("/embeddings")) return new Response(JSON.stringify({ data: [{ embedding: [1, 0, 0] }] }), { status: 200 });
      return new Response(JSON.stringify({ choices: [{ message: { content: "20 days per year, per [handbook.pdf p.3]." } }] }), { status: 200 });
    }) as typeof fetch;

    const reply = await withMockedFetch(mockFetch, () =>
      service.addMessage(user.id, conversation.id, { role: "user", content: "how much vacation do I get?" }, true),
    );

    const citations = (reply.meta as { rag_citations?: Array<{ filename: string }> }).rag_citations ?? [];
    assert.equal(citations.length, 1);
    assert.equal(citations[0]?.filename, "handbook.pdf");
  });
});

test("toConversationResponse maps snake_case fields for the frontend contract", async () => {
  await withTempDb(async () => {
    const db = getDb();
    const user = new AuthService(db).register({ email: "user@example.com", fullName: "User", password: "password123" });
    await createOpenAiProvider(user.id);
    const service = new ChatService(db);
    const conversation = await withMockedFetch(chatCompletionFetch("hi"), () => service.createConversation(user.id, { title: "Chat", initialMessage: "hello" }, false));

    const response = toConversationResponse(conversation, service.messagesFor(conversation.id));
    assert.equal(response.model_id, conversation.modelId);
    assert.equal(response.messages.length, 2);
    assert.equal(response.messages[0]?.conversation_id, conversation.id);
  });
});
