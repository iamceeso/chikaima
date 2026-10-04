import { EventEmitter } from "node:events";

import type { jobEvents } from "../db/schema.js";

export type JobEventRow = typeof jobEvents.$inferSelect;

export type JobEventType = "queued" | "started" | "stage" | "completed" | "retry_scheduled" | "failed" | "cancelled" | "recovered";

/**
 * In-process fan-out of job events to live subscribers (the SSE route).
 * The `job_events` table is the durable record; this bus only exists so
 * subscribers are told about new rows instead of polling for them. Safe
 * because the worker runs inside the same long-lived `next start` process
 * as the route handlers.
 */
class JobEventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // One listener per open SSE connection; the default cap of 10 would warn spuriously.
    this.emitter.setMaxListeners(0);
  }

  publish(event: JobEventRow): void {
    this.emitter.emit("event", event);
  }

  /** Subscribes to events for one user. Returns the unsubscribe function. */
  subscribe(userId: string, listener: (event: JobEventRow) => void): () => void {
    const handler = (event: JobEventRow) => {
      if (event.userId === userId) listener(event);
    };
    this.emitter.on("event", handler);
    return () => {
      this.emitter.off("event", handler);
    };
  }
}

/** Process-wide singleton, guarded against Next.js dev-mode module re-evaluation via globalThis. */
export function getJobEventBus(): JobEventBus {
  const globalKey = "__chikaimaJobEventBus__";
  const globalRef = globalThis as typeof globalThis & { [globalKey]?: JobEventBus };
  if (!globalRef[globalKey]) {
    globalRef[globalKey] = new JobEventBus();
  }
  return globalRef[globalKey]!;
}

export interface JobEventResponse {
  id: number;
  job_id: string;
  event_type: string;
  message: string | null;
  data: Record<string, unknown>;
  created_at: string;
}

export function toJobEventResponse(row: JobEventRow): JobEventResponse {
  return {
    id: row.id,
    job_id: row.jobId,
    event_type: row.eventType,
    message: row.message,
    data: row.data as Record<string, unknown>,
    created_at: row.createdAt,
  };
}
