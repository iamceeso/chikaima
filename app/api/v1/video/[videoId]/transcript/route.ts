import { NextResponse, type NextRequest } from "next/server";

import { AssetService } from "@/core/assets/assetService.js";
import { toTranscriptResponse } from "@/core/assets/assetResponses.js";

import { db, handleRoute, requireUser } from "../../../_lib/http.js";

type RouteContext = { params: Promise<{ videoId: string }> };

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { videoId } = await context.params;
    const database = db();
    const user = await requireUser(request, database);
    const transcript = new AssetService(database).getForResource(user.id, "video", videoId);
    return NextResponse.json(toTranscriptResponse(transcript));
  });
}
