import { NextResponse, type NextRequest } from "next/server";

import { toRunResponse } from "@/core/collab/collabResponses.js";
import { CollabService } from "@/core/collab/collabService.js";

import { db, handleRoute, readJson, requireAdminUser } from "../../../../_lib/http.js";

type RouteContext = { params: Promise<{ teamId: string }> };

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { teamId } = await context.params;
    const database = db();
    const user = await requireAdminUser(request, database);
    return NextResponse.json(new CollabService(database).listRuns(user.id, teamId).map(toRunResponse));
  });
}

/** Starts the team on a task. Returns immediately; follow progress on the run's stream. */
export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { teamId } = await context.params;
    const database = db();
    const user = await requireAdminUser(request, database);
    const { task } = await readJson<{ task?: string }>(request);
    const run = new CollabService(database).startRun(user.id, teamId, task ?? "");
    return NextResponse.json(toRunResponse(run), { status: 202 });
  });
}
