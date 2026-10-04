import { NextResponse, type NextRequest } from "next/server";

import { toTeamResponse } from "@/core/collab/collabResponses.js";
import { CollabService, type TeamInput } from "@/core/collab/collabService.js";

import { db, handleRoute, noContent, readJson, requireAdminUser } from "../../../_lib/http.js";

type RouteContext = { params: Promise<{ teamId: string }> };

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { teamId } = await context.params;
    const database = db();
    const user = await requireAdminUser(request, database);
    return NextResponse.json(toTeamResponse(new CollabService(database).getTeam(user.id, teamId)));
  });
}

/** Replaces the team's settings and member list (roles, models, precedence). */
export async function PUT(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { teamId } = await context.params;
    const database = db();
    const user = await requireAdminUser(request, database);
    const team = new CollabService(database).updateTeam(user.id, teamId, await readJson<TeamInput>(request));
    return NextResponse.json(toTeamResponse(team));
  });
}

/** Deletes the team and its run history. The folder on disk is left as it is. */
export async function DELETE(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { teamId } = await context.params;
    const database = db();
    const user = await requireAdminUser(request, database);
    new CollabService(database).deleteTeam(user.id, teamId);
    return noContent();
  });
}
