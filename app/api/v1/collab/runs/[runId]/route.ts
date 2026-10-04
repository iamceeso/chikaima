import { NextResponse, type NextRequest } from "next/server";

import { toApprovalResponse, toMessageResponse, toRunResponse } from "@/core/collab/collabResponses.js";
import { CollabService } from "@/core/collab/collabService.js";

import { db, handleRoute, requireAdminUser } from "../../../_lib/http.js";

type RouteContext = { params: Promise<{ runId: string }> };

/** One run plus its transcript (pass `?after=<message id>` for only newer messages) and every approval it has asked for. */
export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { runId } = await context.params;
    const database = db();
    const user = await requireAdminUser(request, database);
    const rawAfter = request.nextUrl.searchParams.get("after");
    const after = rawAfter && /^\d+$/.test(rawAfter) ? Number.parseInt(rawAfter, 10) : 0;
    const { run, messages, approvals } = new CollabService(database).getRun(user.id, runId, after);
    return NextResponse.json({ ...toRunResponse(run), messages: messages.map(toMessageResponse), approvals: approvals.map(toApprovalResponse) });
  });
}
