import { NextResponse, type NextRequest } from "next/server";

import { JobDispatcher } from "@/core/jobs/dispatcher.js";
import { toJobResponse } from "@/core/jobs/jobResponses.js";

import { db, handleRoute, requireUser } from "../_lib/http.js";

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const database = db();
    const user = await requireUser(request, database);
    const jobs = new JobDispatcher(database).listForUser(user.id);
    return NextResponse.json(jobs.map(toJobResponse));
  });
}
