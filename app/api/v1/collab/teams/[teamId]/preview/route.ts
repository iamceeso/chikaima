import { NextResponse, type NextRequest } from "next/server";

import { CollabWorkspaceService } from "@/core/collab/workspaceService.js";

import { db, handleRoute, noContent, requireAdminUser } from "../../../../_lib/http.js";

type RouteContext = { params: Promise<{ teamId: string }> };

/** Preview status, port and recent server logs. */
export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { teamId } = await context.params;
    const database = db();
    const user = await requireAdminUser(request, database);
    return NextResponse.json(new CollabWorkspaceService(database).previewInfo(user.id, teamId));
  });
}

/** Starts (or restarts) the preview server. */
export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { teamId } = await context.params;
    const database = db();
    const user = await requireAdminUser(request, database);
    return NextResponse.json(await new CollabWorkspaceService(database).startPreview(user.id, teamId));
  });
}

export async function DELETE(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { teamId } = await context.params;
    const database = db();
    const user = await requireAdminUser(request, database);
    await new CollabWorkspaceService(database).stopPreview(user.id, teamId);
    return noContent();
  });
}
