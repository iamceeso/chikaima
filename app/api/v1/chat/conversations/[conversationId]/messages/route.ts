import { NextResponse, type NextRequest } from "next/server";

import { ChatService, toMessageResponse } from "@/core/chat/chatService.js";

import { db, handleRoute, readJson, requireUser } from "../../../../_lib/http.js";

interface MessageCreateBody {
  role: "system" | "user" | "assistant";
  content: string;
  metadata?: Record<string, unknown>;
}

type RouteContext = { params: Promise<{ conversationId: string }> };

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { conversationId } = await context.params;
    const database = db();
    const user = await requireUser(request, database);
    const body = await readJson<MessageCreateBody>(request);
    const message = await new ChatService(database).addMessage(user.id, conversationId, {
      role: body.role,
      content: body.content,
      metadata: body.metadata,
    });
    return NextResponse.json(toMessageResponse(message));
  });
}
