import { NextResponse, type NextRequest } from "next/server";

import { AssetService } from "@/core/assets/assetService.js";
import { toDocumentResponse } from "@/core/assets/assetResponses.js";

import { db, handleRoute, requireUser } from "../_lib/http.js";

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const database = db();
    const user = await requireUser(request, database);
    const rows = new AssetService(database).listForUser(user.id, "document");
    return NextResponse.json(rows.map(toDocumentResponse));
  });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const database = db();
    const user = await requireUser(request, database);
    await new AssetService(database).deleteAllResources(user.id, "document");
    return new NextResponse(null, { status: 204 });
  });
}
