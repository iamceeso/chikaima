import { NextResponse, type NextRequest } from "next/server";

import { toMessageResponse } from "@/core/collab/collabResponses.js";
import { CollabService } from "@/core/collab/collabService.js";
import { CollabRepository, getCollabMessageBus, type CollabMessageRow } from "@/core/collab/repository.js";
import { HttpError } from "@/core/errors.js";

import { db, requireAdminUser } from "../../../../_lib/http.js";

const HEARTBEAT_INTERVAL_MS = 15_000;

type RouteContext = { params: Promise<{ runId: string }> };

/**
 * Streams a run's transcript as Server-Sent Events: every message so far
 * (or after `?after=` / `Last-Event-ID`), then new ones live. A `run_status`
 * event is sent whenever a message arrives so clients can tell the run ended.
 */
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const { runId } = await context.params;
  const database = db();
  try {
    const user = await requireAdminUser(request, database);
    new CollabService(database).getRun(user.id, runId, Number.MAX_SAFE_INTEGER);
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ detail: error.detail }, { status: error.statusCode });
    }
    throw error;
  }

  const rawAfter = request.nextUrl.searchParams.get("after") ?? request.headers.get("last-event-id");
  const afterId = rawAfter && /^\d+$/.test(rawAfter) ? Number.parseInt(rawAfter, 10) : 0;
  const repo = new CollabRepository(database);
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let lastSentId = afterId;
      let closed = false;

      const sendStatus = () => {
        const run = repo.getRun(runId);
        if (run) controller.enqueue(encoder.encode(`event: run_status\ndata: ${JSON.stringify({ status: run.status, error_message: run.errorMessage })}\n\n`));
      };
      const send = (message: CollabMessageRow) => {
        // Live messages can race the replay below; ids are monotonic, so drop anything already sent.
        if (closed || message.id <= lastSentId) return;
        lastSentId = message.id;
        controller.enqueue(encoder.encode(`id: ${message.id}\nevent: collab_message\ndata: ${JSON.stringify(toMessageResponse(message))}\n\n`));
        sendStatus();
      };

      // Subscribe before replaying so nothing emitted in between is lost.
      const unsubscribe = getCollabMessageBus().subscribe(runId, send);
      for (const message of repo.listMessages(runId, afterId)) send(message);
      sendStatus();
      controller.enqueue(encoder.encode(`event: ready\ndata: {}\n\n`));

      const heartbeat = setInterval(() => {
        if (closed) return;
        controller.enqueue(encoder.encode(`: keep-alive\n\n`));
        sendStatus();
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
