import { NextResponse, type NextRequest } from "next/server";

import { ProjectService } from "@/core/collab/projectService.js";

import { db, handleRoute, requireAdminUser } from "../../../../_lib/http.js";

type RouteContext = { params: Promise<{ teamId: string }> };

/** Text search across the project's files: `?q=…`. */
export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { teamId } = await context.params;
    const database = db();
    const user = await requireAdminUser(request, database);
    return NextResponse.json(new ProjectService(database).search(user.id, teamId, request.nextUrl.searchParams.get("q") ?? ""));
  });
}
