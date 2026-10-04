import { NextResponse, type NextRequest } from "next/server";

import { ProjectService } from "@/core/collab/projectService.js";
import { badRequest } from "@/core/errors.js";

import { db, handleRoute, requireAdminUser } from "../../../../../_lib/http.js";

type RouteContext = { params: Promise<{ teamId: string }> };

/** Files a branch changed since it left `base` (`?base=main&head=chikaima/run-…`), with both sides for review. */
export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { teamId } = await context.params;
    const base = request.nextUrl.searchParams.get("base");
    const head = request.nextUrl.searchParams.get("head");
    if (!base || !head) throw badRequest("base and head are required.");
    const database = db();
    const user = await requireAdminUser(request, database);
    return NextResponse.json(await new ProjectService(database).compare(user.id, teamId, base, head));
  });
}
