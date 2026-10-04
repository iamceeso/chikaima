import { NextResponse, type NextRequest } from "next/server";

import { toApprovalResponse } from "@/core/collab/collabResponses.js";
import { CollabService } from "@/core/collab/collabService.js";

import { db, handleRoute, readJson, requireAdminUser } from "../../../../../_lib/http.js";

type RouteContext = { params: Promise<{ runId: string; approvalId: string }> };

/** Approves or rejects what an agent is waiting on. Body: `{ "decision": "approve" | "reject", "note"?: string }`. */
export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { runId, approvalId } = await context.params;
    const database = db();
    const user = await requireAdminUser(request, database);
    const { decision, note } = await readJson<{ decision?: string; note?: string | null }>(request);
    const approval = new CollabService(database).resolveApproval(user.id, runId, approvalId, decision ?? "", note);
    return NextResponse.json(toApprovalResponse(approval));
  });
}
