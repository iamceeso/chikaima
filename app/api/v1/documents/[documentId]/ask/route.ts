import { NextResponse, type NextRequest } from "next/server";

import { AssetService } from "@/core/assets/assetService.js";

import { db, handleRoute, readJson, requireUser } from "../../../_lib/http.js";

interface AskBody {
  question: string;
}

type RouteContext = { params: Promise<{ documentId: string }> };

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { documentId } = await context.params;
    const database = db();
    const user = await requireUser(request, database);
    const body = await readJson<AskBody>(request);
    const answer = await new AssetService(database).queryResource(user.id, "document", documentId, body.question);
    return NextResponse.json({ document_id: documentId, answer });
  });
}
