import { NextResponse, type NextRequest } from "next/server";

import { CollabService } from "@/core/collab/collabService.js";

import { db, handleRoute, readJson, requireAdminUser } from "../../../../_lib/http.js";

type RouteContext = { params: Promise<{ teamId: string }> };

/**
 * Copies the project folder to another location on this machine. Body:
 * `{ "destination": "~/Backups/my-app" }`; the folder must be new or empty.
 */
export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { teamId } = await context.params;
    const database = db();
    const user = await requireAdminUser(request, database);
    const { destination } = await readJson<{ destination?: string }>(request);
    return NextResponse.json(await new CollabService(database).saveCopy(user.id, teamId, destination ?? ""), { status: 201 });
  });
}
