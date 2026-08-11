import { NextResponse, type NextRequest } from "next/server";

import { AssetService } from "@/core/assets/assetService.js";
import { toAudioResponse } from "@/core/assets/assetResponses.js";

import { db, handleRoute, requireUser } from "../_lib/http.js";

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const database = db();
    const user = await requireUser(request, database);
    const rows = new AssetService(database).listForUser(user.id, "audio");
    return NextResponse.json(rows.map(toAudioResponse));
  });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const database = db();
    const user = await requireUser(request, database);
    await new AssetService(database).deleteAllResources(user.id, "audio");
    return new NextResponse(null, { status: 204 });
  });
}
