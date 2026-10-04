import { NextResponse, type NextRequest } from "next/server";

import { CollabWorkspaceService } from "@/core/collab/workspaceService.js";

import { db, handleRoute, requireAdminUser } from "../../../../../../_lib/http.js";

type RouteContext = { params: Promise<{ teamId: string; hash: string }> };

/** Files a commit changed, with before/after content for the side-by-side diff. */
export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { teamId, hash } = await context.params;
    const database = db();
    const user = await requireAdminUser(request, database);
    return NextResponse.json(await new CollabWorkspaceService(database).gitCommitFiles(user.id, teamId, hash));
  });
}
