import { NextResponse, type NextRequest } from "next/server";

import { CollabService } from "@/core/collab/collabService.js";

import { db, handleRoute, requireAdminUser } from "../../../../_lib/http.js";

type RouteContext = { params: Promise<{ teamId: string }> };

/** The team folder's files and directories, for the workspace file tree. */
export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { teamId } = await context.params;
    const database = db();
    const user = await requireAdminUser(request, database);
    return NextResponse.json(new CollabService(database).listFiles(user.id, teamId));
  });
}
