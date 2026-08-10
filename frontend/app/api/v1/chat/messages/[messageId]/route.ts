import { NextResponse, type NextRequest } from "next/server";

import { ChatService, toMessageResponse } from "@/core/chat/chatService.js";

import { db, handleRoute, readJson, requireUser } from "../../../_lib/http.js";

interface MessageUpdateBody {
  content: string;
}

type RouteContext = { params: Promise<{ messageId: string }> };

export async function PATCH(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { messageId } = await context.params;
    const database = db();
    const user = await requireUser(request, database);
    const body = await readJson<MessageUpdateBody>(request);
    const message = await new ChatService(database).updateMessage(user.id, messageId, body.content);
    return NextResponse.json(toMessageResponse(message));
  });
}
