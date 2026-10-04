import { NextResponse, type NextRequest } from "next/server";

import { CollabService } from "@/core/collab/collabService.js";
import { badRequest } from "@/core/errors.js";

import { db, handleRoute, readJson, requireAdminUser } from "../../../../../_lib/http.js";

type RouteContext = { params: Promise<{ teamId: string }> };

/** One file's text (`?path=src/app.ts`). */
export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { teamId } = await context.params;
    const path = request.nextUrl.searchParams.get("path");
    if (!path) throw badRequest("path is required.");
    const database = db();
    const user = await requireAdminUser(request, database);
    return NextResponse.json(new CollabService(database).readFile(user.id, teamId, path));
  });
}

/** Saves a human edit. Body: `{ "path": string, "content": string }`. Refused while agents are working in the folder. */
export async function PUT(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { teamId } = await context.params;
    const database = db();
    const user = await requireAdminUser(request, database);
    const { path, content } = await readJson<{ path?: string; content?: string }>(request);
    if (!path) throw badRequest("path is required.");
    return NextResponse.json(new CollabService(database).writeFile(user.id, teamId, path, content as string));
  });
}
