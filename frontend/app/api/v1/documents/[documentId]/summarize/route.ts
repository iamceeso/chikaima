import { NextResponse, type NextRequest } from "next/server";

import { AssetService } from "@/core/assets/assetService.js";
import { toSummaryArtifactResponse } from "@/core/assets/assetResponses.js";

import { db, handleRoute, requireUser } from "../../../_lib/http.js";

type RouteContext = { params: Promise<{ documentId: string }> };

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { documentId } = await context.params;
    const database = db();
    const user = await requireUser(request, database);
    const summaries = await new AssetService(database).summarizeResource(user.id, "document", documentId);
    return NextResponse.json(summaries.map(toSummaryArtifactResponse));
  });
}
