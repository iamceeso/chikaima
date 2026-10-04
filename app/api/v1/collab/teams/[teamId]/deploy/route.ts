import { NextResponse, type NextRequest } from "next/server";

import { CollabWorkspaceService } from "@/core/collab/workspaceService.js";
import { HttpError } from "@/core/errors.js";

import { db, requireAdminUser, streamCommandOutput } from "../../../../_lib/http.js";

type RouteContext = { params: Promise<{ teamId: string }> };

/** Runs the team's deploy command and streams its output. */
export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const { teamId } = await context.params;
  const database = db();
  let userId: string;
  try {
    userId = (await requireAdminUser(request, database)).id;
  } catch (error) {
    if (error instanceof HttpError) return NextResponse.json({ detail: error.detail }, { status: error.statusCode });
    throw error;
  }
  return streamCommandOutput(request, (handlers) => new CollabWorkspaceService(database).deploy(userId, teamId, handlers));
}
