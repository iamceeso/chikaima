"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { api } from "@/services/api";
import type { JobEvent } from "@/types";

const MAX_RECONNECT_DELAY_MS = 30_000;

/**
 * Subscribes to the server's job event stream and keeps the `["jobs"]` and
 * `["job", id]` queries fresh as events arrive, instead of polling. On a
 * dropped connection it reconnects with backoff, resuming from the last
 * event id so nothing is missed. Returns the latest stage message per job.
 */
export function useJobEvents(token: string | null | undefined): Record<string, string> {
  const queryClient = useQueryClient();
  const [stageByJob, setStageByJob] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!token) return;

    const controller = new AbortController();
    let lastEventId: number | null = null;
    let reconnectDelay = 1_000;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const handleEvent = (event: JobEvent) => {
      lastEventId = event.id;
      if (event.event_type === "stage" && event.message) {
        setStageByJob((current) => ({ ...current, [event.job_id]: event.message! }));
      }
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
      void queryClient.invalidateQueries({ queryKey: ["job", event.job_id] });
    };

    const connect = async () => {
      try {
        await api.streamJobEvents(
          token,
          {
            onEvent: handleEvent,
            onReady: () => {
              reconnectDelay = 1_000;
              // Catch up on anything that changed before the first connection.
              if (lastEventId === null) void queryClient.invalidateQueries({ queryKey: ["jobs"] });
            },
          },
          { after: lastEventId, signal: controller.signal },
        );
      } catch {
        // fall through to reconnect
      }
      if (controller.signal.aborted) return;
      reconnectTimer = setTimeout(() => void connect(), reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
    };

    void connect();
    return () => {
      controller.abort();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [token, queryClient]);

  return stageByJob;
}
