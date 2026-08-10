import { NextResponse, type NextRequest } from "next/server";

import { AssetService } from "@/core/assets/assetService.js";
import { toTranscriptResponse } from "@/core/assets/assetResponses.js";

import { db, handleRoute, requireUser } from "../../../_lib/http.js";

type RouteContext = { params: Promise<{ audioId: string }> };

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { audioId } = await context.params;
    const database = db();
    const user = await requireUser(request, database);
    const transcript = new AssetService(database).getForResource(user.id, "audio", audioId);
    return NextResponse.json(toTranscriptResponse(transcript));
  });
}
