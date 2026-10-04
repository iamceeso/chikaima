import { NextResponse, type NextRequest } from "next/server";

import { toRunResponse } from "@/core/collab/collabResponses.js";
import { ProjectService } from "@/core/collab/projectService.js";

import { db, handleRoute, noContent, requireAdminUser } from "../../../../../_lib/http.js";

type RouteContext = { params: Promise<{ teamId: string; taskId: string }> };

/** Assigns the task to the team (starts a run), or retries a finished one. */
export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { teamId, taskId } = await context.params;
    const database = db();
    const user = await requireAdminUser(request, database);
    return NextResponse.json(toRunResponse(new ProjectService(database).startTask(user.id, teamId, taskId)), { status: 202 });
  });
}

/** Removes a backlog task. */
export async function DELETE(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { teamId, taskId } = await context.params;
    const database = db();
    const user = await requireAdminUser(request, database);
    new ProjectService(database).deleteTask(user.id, teamId, taskId);
    return noContent();
  });
}
