"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Clock3, LoaderCircle } from "lucide-react";
import { useState } from "react";

import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { useJobEvents } from "@/hooks/use-job-events";
import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth-store";
import type { Job } from "@/types";

function JobHistory({ token, jobId }: { token: string; jobId: string }) {
  const { data: job, isLoading } = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => api.getJob(token, jobId),
  });

  if (isLoading) {
    return <p className="text-xs text-foreground-muted">Loading history…</p>;
  }
  if (!job?.events.length) {
    return <p className="text-xs text-foreground-muted">No events recorded.</p>;
  }

  return (
    <ol className="space-y-1.5">
      {job.events.map((event) => (
        <li key={event.id} className="flex gap-3 text-xs">
          <span className="shrink-0 tabular-nums text-foreground-muted">{new Date(event.created_at).toLocaleTimeString()}</span>
          <span className="shrink-0 font-semibold uppercase tracking-[0.12em] text-foreground">{event.event_type.replace("_", " ")}</span>
          {event.message ? <span className="min-w-0 wrap-break-word text-foreground-muted">{event.message}</span> : null}
        </li>
      ))}
    </ol>
  );
}

function JobRow({ job, token, stage }: { job: Job; token: string; stage?: string }) {
  const [expanded, setExpanded] = useState(false);
  const isActive = job.status === "running" || job.status === "queued";
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <div className="rounded-2xl border border-border bg-background px-4 py-4">
      <button type="button" onClick={() => setExpanded((value) => !value)} className="flex w-full items-center justify-between gap-3 text-left">
        <div className="flex min-w-0 items-start gap-2">
          <Chevron className="mt-0.5 h-4 w-4 shrink-0 text-foreground-muted" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{job.job_type}</p>
            <p className="mt-1 truncate text-xs text-foreground-muted">
              {job.resource_type ?? "asset"} {job.resource_id ? `- ${job.resource_id}` : ""}
              {job.depends_on.length > 0 ? ` · waits on ${job.depends_on.length} job(s)` : ""}
              {job.attempts > 1 ? ` · attempt ${job.attempts}/${job.max_attempts}` : ""}
            </p>
            {job.status === "running" && stage ? <p className="mt-1 text-xs text-primary">{stage}</p> : null}
            {job.status === "failed" && job.error_message ? <p className="mt-1 text-xs text-destructive">{job.error_message}</p> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-sm font-medium text-foreground">
          {job.status === "running" ? <LoaderCircle className="h-4 w-4 animate-spin text-primary" /> : null}
          <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs uppercase tracking-[0.18em] text-foreground-muted">{job.status}</span>
        </div>
      </button>

      {isActive ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface">
          <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${job.progress}%` }} />
        </div>
      ) : null}

      {expanded ? (
        <div className="mt-4 border-t border-border pt-3">
          <JobHistory token={token} jobId={job.id} />
        </div>
      ) : null}
    </div>
  );
}

export default function ProcessingPage() {
  const token = useAuthStore((state) => state.tokens?.access_token);
  const stageByJob = useJobEvents(token);
  const { data: jobs } = useQuery({
    queryKey: ["jobs"],
    queryFn: () => {
      if (!token) {
        return Promise.resolve([]);
      }
      return api.getJobs(token);
    },
  });

  return (
    <>
      <Topbar title="Processing" description="Track transcription, summarization, extraction, and media analysis jobs in one place." />

      <Card className="rounded-[1.75rem] bg-surface p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <Clock3 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground">Job queue</h2>
            <p className="mt-1 text-sm text-foreground-muted">Live status for every background job. Expand a job to see its full event history.</p>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {jobs?.length && token ? (
            jobs.map((job) => <JobRow key={job.id} job={job} token={token} stage={stageByJob[job.id]} />)
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-background px-4 py-6 text-center text-sm text-foreground-muted">
              No processing jobs yet.
            </div>
          )}
        </div>
      </Card>
    </>
  );
}
