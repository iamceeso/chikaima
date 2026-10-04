import { NextResponse, type NextRequest } from "next/server";

import { CollabService } from "@/core/collab/collabService.js";
import { badRequest } from "@/core/errors.js";

import { db, handleRoute, noContent, readJson, requireAdminUser } from "../../../../_lib/http.js";

type RouteContext = { params: Promise<{ teamId: string }> };

/** The team folder's files and directories, for the workspace file tree. */
export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { teamId } = await context.params;
    const database = db();
    const user = await requireAdminUser(request, database);
    return NextResponse.json(new CollabService(database).listFiles(user.id, teamId));
  });
}

/** Creates an empty file or a folder. Body: `{ "path": string, "type": "file" | "dir" }`. */
export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { teamId } = await context.params;
    const database = db();
    const user = await requireAdminUser(request, database);
    const { path, type } = await readJson<{ path?: string; type?: string }>(request);
    if (!path) throw badRequest("path is required.");
    return NextResponse.json(new CollabService(database).createEntry(user.id, teamId, path, type ?? "file"), { status: 201 });
  });
}

/** Renames or moves a file or folder. Body: `{ "from": string, "to": string }`. */
export async function PATCH(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { teamId } = await context.params;
    const database = db();
    const user = await requireAdminUser(request, database);
    const { from, to } = await readJson<{ from?: string; to?: string }>(request);
    if (!from || !to) throw badRequest("from and to are required.");
    return NextResponse.json(new CollabService(database).renameEntry(user.id, teamId, from, to));
  });
}

/** Deletes a file, or a folder and its contents (`?path=src/old`). */
export async function DELETE(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { teamId } = await context.params;
    const path = request.nextUrl.searchParams.get("path");
    if (!path) throw badRequest("path is required.");
    const database = db();
    const user = await requireAdminUser(request, database);
    new CollabService(database).deleteEntry(user.id, teamId, path);
    return noContent();
  });
}
