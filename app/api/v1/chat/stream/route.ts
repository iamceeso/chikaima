import { NextResponse, type NextRequest } from "next/server";

import { ChatService, type ChatStreamEvent } from "@/core/chat/chatService.js";
import { HttpError } from "@/core/errors.js";

import { db, readJson, requireUser } from "../../_lib/http.js";

interface StreamChatBody {
  content: string;
  conversation_id?: string | null;
  title?: string | null;
  model_id?: string | null;
  metadata?: Record<string, unknown>;
  use_rag?: boolean;
}

function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function toSseFrame(event: ChatStreamEvent): string {
  switch (event.type) {
    case "metadata":
      return sseFrame("metadata", {
        conversation_id: event.conversationId,
        user_message_id: event.userMessageId,
        provider: event.provider,
        model: event.model,
        rag_citations: event.ragCitations,
        processing_blocked: event.processingBlocked,
      });
    case "token":
      return sseFrame("token", { text: event.text });
    case "done":
      return sseFrame("done", {});
    case "error":
      return sseFrame("error", { detail: event.detail });
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const database = db();
  let user;
  let body: StreamChatBody;
  try {
    user = await requireUser(request, database);
    body = await readJson<StreamChatBody>(request);
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ detail: error.detail }, { status: error.statusCode });
    }
    throw error;
  }

  const generator = new ChatService(database).streamChat(user.id, {
    content: body.content,
    conversationId: body.conversation_id,
    title: body.title,
    modelId: body.model_id,
    metadata: body.metadata,
    useRag: body.use_rag,
  });

  // The first `next()` call runs everything up to (and including) the
  // conversation-lookup/creation and the user-message insert, so a bad
  // conversation_id still surfaces as a normal JSON 404 instead of a
  // malformed SSE stream.
  let first: IteratorResult<ChatStreamEvent>;
  try {
    first = await generator.next();
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ detail: error.detail }, { status: error.statusCode });
    }
    console.error(error);
    return NextResponse.json({ detail: "Internal server error" }, { status: 500 });
  }
  if (first.done) {
    return new NextResponse(null, { status: 204 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(toSseFrame(first.value)));
      try {
        for await (const event of generator) {
          controller.enqueue(encoder.encode(toSseFrame(event)));
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
