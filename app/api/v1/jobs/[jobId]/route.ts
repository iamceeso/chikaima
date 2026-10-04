import { NextResponse, type NextRequest } from "next/server";

import { notFound } from "@/core/errors.js";
import { toJobEventResponse } from "@/core/jobs/events.js";
import { toJobResponse } from "@/core/jobs/jobResponses.js";
import { JobRepository } from "@/core/jobs/repository.js";

import { db, handleRoute, requireUser } from "../../_lib/http.js";

type RouteContext = { params: Promise<{ jobId: string }> };

/** One job plus its full append-only event history. */
export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { jobId } = await context.params;
    const database = db();
    const user = await requireUser(request, database);
    const repo = new JobRepository(database);
    const job = repo.get(jobId);
    if (!job || job.userId !== user.id) {
      throw notFound("Job not found");
    }
    return NextResponse.json({ ...toJobResponse(job), events: repo.listEvents(job.id).map(toJobEventResponse) });
  });
}
