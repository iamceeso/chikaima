import { NextResponse, type NextRequest } from "next/server";

import { HttpError } from "@/core/errors.js";
import { getJobEventBus, toJobEventResponse, type JobEventRow } from "@/core/jobs/events.js";
import { JobRepository } from "@/core/jobs/repository.js";

import { db, requireUser } from "../../_lib/http.js";

const HEARTBEAT_INTERVAL_MS = 15_000;

/**
 * Pushes the caller's job events as Server-Sent Events, so clients react to
 * job changes instead of polling `/jobs`. Resumable: pass the last seen
 * event id as `?after=` (or the `Last-Event-ID` header) to replay anything
 * missed while disconnected before live events start.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const database = db();
  let user;
  try {
    user = await requireUser(request, database);
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ detail: error.detail }, { status: error.statusCode });
    }
    throw error;
  }

  const rawAfter = request.nextUrl.searchParams.get("after") ?? request.headers.get("last-event-id");
  const afterId = rawAfter && /^\d+$/.test(rawAfter) ? Number.parseInt(rawAfter, 10) : null;

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let lastSentId = afterId ?? 0;
      let closed = false;

      const send = (event: JobEventRow) => {
        // Live events can race the replay below; ids are monotonic, so drop anything already sent.
        if (closed || event.id <= lastSentId) return;
        lastSentId = event.id;
        controller.enqueue(encoder.encode(`id: ${event.id}\nevent: job_event\ndata: ${JSON.stringify(toJobEventResponse(event))}\n\n`));
      };

      // Subscribe before replaying so nothing emitted in between is lost.
      const unsubscribe = getJobEventBus().subscribe(user.id, send);
      if (afterId !== null) {
        for (const event of new JobRepository(database).listEventsForUserAfter(user.id, afterId)) send(event);
      }
      controller.enqueue(encoder.encode(`event: ready\ndata: {}\n\n`));

      const heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(`: keep-alive\n\n`));
      }, HEARTBEAT_INTERVAL_MS);

      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed by the runtime
        }
      };
      request.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
