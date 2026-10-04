import { NextResponse, type NextRequest } from "next/server";

import { CollabWorkspaceService } from "@/core/collab/workspaceService.js";
import { badRequest } from "@/core/errors.js";

import { db, handleRoute, readJson, requireAdminUser } from "../../../../_lib/http.js";

type RouteContext = { params: Promise<{ teamId: string }> };

/** Branch, branches, uncommitted changes and recent commits of the team folder. */
export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { teamId } = await context.params;
    const database = db();
    const user = await requireAdminUser(request, database);
    return NextResponse.json(await new CollabWorkspaceService(database).gitOverview(user.id, teamId));
  });
}

/** Body: `{ "action": "init" | "commit" | "checkout" | "merge" | "discard", "message"?: string, "branch"?: string }`. */
export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { teamId } = await context.params;
    const database = db();
    const user = await requireAdminUser(request, database);
    const body = await readJson<{ action?: string; message?: string; branch?: string }>(request);
    const service = new CollabWorkspaceService(database);
    switch (body.action) {
      case "init":
        await service.gitInit(user.id, teamId);
        break;
      case "commit":
        return NextResponse.json({ commit: await service.gitCommit(user.id, teamId, body.message ?? "") });
      case "checkout":
        await service.gitCheckout(user.id, teamId, body.branch ?? "");
        break;
      case "merge":
        await service.gitMerge(user.id, teamId, body.branch ?? "");
        break;
      case "discard":
        await service.gitDiscard(user.id, teamId);
        break;
      default:
        throw badRequest('action must be one of "init", "commit", "checkout", "merge" or "discard".');
    }
    return NextResponse.json({ ok: true });
  });
}
