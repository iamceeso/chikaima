import { NextResponse, type NextRequest } from "next/server";

import { ChatService } from "@/core/chat/chatService.js";

import { db, handleRoute, requireUser } from "../../../_lib/http.js";

type RouteContext = { params: Promise<{ conversationId: string }> };

export async function DELETE(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { conversationId } = await context.params;
    const database = db();
    const user = await requireUser(request, database);
    new ChatService(database).deleteConversation(user.id, conversationId);
    return new NextResponse(null, { status: 204 });
  });
}
