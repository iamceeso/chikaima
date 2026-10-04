import { NextResponse, type NextRequest } from "next/server";

import { toTeamResponse } from "@/core/collab/collabResponses.js";
import { ProjectService } from "@/core/collab/projectService.js";

import { db, handleRoute, requireAdminUser } from "../../_lib/http.js";

/** Every project with what the dashboard shows: branch, repository, stack, team, runtime and activity. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const database = db();
    const user = await requireAdminUser(request, database);
    const projects = await new ProjectService(database).listProjects(user.id);
    return NextResponse.json(projects.map(({ team, ...summary }) => ({ ...toTeamResponse(team), ...summary })));
  });
}
