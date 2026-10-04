import { NextResponse, type NextRequest } from "next/server";

import { ProjectService } from "@/core/collab/projectService.js";

import { db, handleRoute, requireAdminUser } from "../../_lib/http.js";

/** Subfolders of `?path=` (relative to the projects root) for the folder picker. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const database = db();
    const user = await requireAdminUser(request, database);
    return NextResponse.json(new ProjectService(database).folders(user.id, request.nextUrl.searchParams.get("path") ?? ""));
  });
}
