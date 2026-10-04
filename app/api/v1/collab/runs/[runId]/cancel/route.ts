import { NextResponse, type NextRequest } from "next/server";

import { toRunResponse } from "@/core/collab/collabResponses.js";
import { CollabService } from "@/core/collab/collabService.js";

import { db, handleRoute, requireAdminUser } from "../../../../_lib/http.js";

type RouteContext = { params: Promise<{ runId: string }> };

/** Asks a run to stop after its current model call; the step in progress is reverted. */
export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { runId } = await context.params;
    const database = db();
    const user = await requireAdminUser(request, database);
    return NextResponse.json(toRunResponse(new CollabService(database).cancelRun(user.id, runId)));
  });
}
