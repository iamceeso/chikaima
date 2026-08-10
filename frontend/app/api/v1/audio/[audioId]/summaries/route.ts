import { NextResponse, type NextRequest } from "next/server";

import { AssetService } from "@/core/assets/assetService.js";
import { toSummaryArtifactResponse } from "@/core/assets/assetResponses.js";

import { db, handleRoute, requireUser } from "../../../_lib/http.js";

type RouteContext = { params: Promise<{ audioId: string }> };

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { audioId } = await context.params;
    const database = db();
    const user = await requireUser(request, database);
    const summaries = new AssetService(database).listSummariesForResource(user.id, "audio", audioId);
    return NextResponse.json(summaries.map(toSummaryArtifactResponse));
  });
}
