import { NextResponse, type NextRequest } from "next/server";

import { CollabWorkspaceService } from "@/core/collab/workspaceService.js";
import { HttpError } from "@/core/errors.js";

import { db, readJson, requireAdminUser, streamCommandOutput } from "../../../../_lib/http.js";

type RouteContext = { params: Promise<{ teamId: string }> };

/** Runs one command in the team folder and streams its output. Body: `{ "command": string }`. Aborting the request kills it. */
export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const { teamId } = await context.params;
  const database = db();
  let userId: string;
  let command: string;
  try {
    userId = (await requireAdminUser(request, database)).id;
    command = (await readJson<{ command?: string }>(request)).command ?? "";
  } catch (error) {
    if (error instanceof HttpError) return NextResponse.json({ detail: error.detail }, { status: error.statusCode });
    throw error;
  }
  return streamCommandOutput(request, (handlers) => new CollabWorkspaceService(database).runTerminal(userId, teamId, command, handlers));
}
