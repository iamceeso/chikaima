import { NextResponse, type NextRequest } from "next/server";

import { ChatService, toMessageResponse } from "@/core/chat/chatService.js";

import { db, handleRoute, readJson, requireUser } from "../../../_lib/http.js";

interface RegenerateBody {
  message_id: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const database = db();
    const user = await requireUser(request, database);
    const body = await readJson<RegenerateBody>(request);
    const message = await new ChatService(database).regenerateMessage(user.id, body.message_id);
    return NextResponse.json(toMessageResponse(message));
  });
}
