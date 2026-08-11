import { NextResponse, type NextRequest } from "next/server";

import { AssetService } from "@/core/assets/assetService.js";

import { db, handleRoute, readJson, requireUser } from "../../../_lib/http.js";

interface TranscriptQueryBody {
  question: string;
}

type RouteContext = { params: Promise<{ transcriptId: string }> };

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { transcriptId } = await context.params;
    const database = db();
    const user = await requireUser(request, database);
    const body = await readJson<TranscriptQueryBody>(request);
    const answer = await new AssetService(database).queryTranscript(user.id, transcriptId, body.question);
    return NextResponse.json({ transcript_id: transcriptId, answer });
  });
}
