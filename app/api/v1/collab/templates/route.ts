import { NextResponse, type NextRequest } from "next/server";

import { TEAM_TEMPLATES } from "@/core/collab/templates.js";

import { db, handleRoute, requireAdminUser } from "../../_lib/http.js";

/** Ready-made team shapes (Solo, SaaS, Laravel) to start a new team from. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAdminUser(request, db());
    return NextResponse.json(TEAM_TEMPLATES);
  });
}
