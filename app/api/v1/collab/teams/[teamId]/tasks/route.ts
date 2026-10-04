import { NextResponse, type NextRequest } from "next/server";

import { ProjectService } from "@/core/collab/projectService.js";

import { db, handleRoute, readJson, requireAdminUser } from "../../../../_lib/http.js";

type RouteContext = { params: Promise<{ teamId: string }> };

/** The project's engineering tasks, with board column, subtasks and progress. */
export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { teamId } = await context.params;
    const database = db();
    const user = await requireAdminUser(request, database);
    return NextResponse.json(new ProjectService(database).listTasks(user.id, teamId));
  });
}

/** Adds a task to the backlog. Body: `{ "title": string, "description"?: string }`. */
export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { teamId } = await context.params;
    const database = db();
    const user = await requireAdminUser(request, database);
    const { title, description } = await readJson<{ title?: string; description?: string }>(request);
    return NextResponse.json(new ProjectService(database).createTask(user.id, teamId, title ?? "", description ?? ""), { status: 201 });
  });
}
