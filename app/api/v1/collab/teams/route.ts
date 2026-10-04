import { NextResponse, type NextRequest } from "next/server";

import { toTeamResponse } from "@/core/collab/collabResponses.js";
import { CollabService, type TeamInput } from "@/core/collab/collabService.js";

import { db, handleRoute, readJson, requireAdminUser } from "../../_lib/http.js";

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const database = db();
    const user = await requireAdminUser(request, database);
    return NextResponse.json(new CollabService(database).listTeams(user.id).map(toTeamResponse));
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const database = db();
    const user = await requireAdminUser(request, database);
    const team = new CollabService(database).createTeam(user.id, await readJson<TeamInput>(request));
    return NextResponse.json(toTeamResponse(team), { status: 201 });
  });
}
