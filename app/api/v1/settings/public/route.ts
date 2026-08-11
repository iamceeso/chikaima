import { NextResponse } from "next/server";

import { WorkspaceService } from "@/core/auth/workspaceService.js";

import { db, handleRoute } from "../../_lib/http.js";

export async function GET(): Promise<NextResponse> {
  return handleRoute(async () => NextResponse.json(new WorkspaceService(db()).getPublicSettings()));
}
