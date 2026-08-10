import { NextResponse, type NextRequest } from "next/server";

import { ChatService, toConversationResponse } from "@/core/chat/chatService.js";

import { db, handleRoute, readJson, requireUser } from "../../_lib/http.js";

interface ConversationCreateBody {
  title: string;
  folder?: string | null;
  model_id?: string | null;
  initial_message?: string | null;
  initial_metadata?: Record<string, unknown>;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const database = db();
    const user = await requireUser(request, database);
    const rows = new ChatService(database).listConversations(user.id);
    return NextResponse.json(rows.map(({ conversation, messages }) => toConversationResponse(conversation, messages)));
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const database = db();
    const user = await requireUser(request, database);
    const body = await readJson<ConversationCreateBody>(request);
    const service = new ChatService(database);
    const conversation = await service.createConversation(user.id, {
      title: body.title,
      folder: body.folder,
      modelId: body.model_id,
      initialMessage: body.initial_message,
      initialMetadata: body.initial_metadata,
    });
    return NextResponse.json(toConversationResponse(conversation, service.messagesFor(conversation.id)));
  });
}
