import { NextResponse, type NextRequest } from "next/server";

import { toTeamResponse } from "@/core/collab/collabResponses.js";
import type { TeamInput } from "@/core/collab/collabService.js";
import { ProjectService } from "@/core/collab/projectService.js";

import { db, handleRoute, readJson, requireAdminUser } from "../../../_lib/http.js";

/** Clones a git repository into a new project. Body: the team settings plus `repo_url`. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const database = db();
    const user = await requireAdminUser(request, database);
    const project = await new ProjectService(database).importProject(user.id, await readJson<TeamInput & { repo_url: string }>(request));
    return NextResponse.json(toTeamResponse(project), { status: 201 });
  });
}
