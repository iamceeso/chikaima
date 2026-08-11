import { NextResponse, type NextRequest } from "next/server";

import { DashboardService } from "@/core/dashboard/dashboardService.js";

import { db, handleRoute, requireUser } from "../_lib/http.js";

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const database = db();
    const user = await requireUser(request, database);
    return NextResponse.json(new DashboardService(database).getSummary(user.id));
  });
}
