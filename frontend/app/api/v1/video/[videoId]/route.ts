import { NextResponse, type NextRequest } from "next/server";

import { AssetService } from "@/core/assets/assetService.js";

import { db, handleRoute, requireUser } from "../../_lib/http.js";

type RouteContext = { params: Promise<{ videoId: string }> };

export async function DELETE(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { videoId } = await context.params;
    const database = db();
    const user = await requireUser(request, database);
    await new AssetService(database).deleteResource(user.id, "video", videoId);
    return new NextResponse(null, { status: 204 });
  });
}
