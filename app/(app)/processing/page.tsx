"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock3, LoaderCircle } from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth-store";

export default function ProcessingPage() {
  const token = useAuthStore((state) => state.tokens?.access_token);
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
      <Topbar
        title="Processing"
        description="Track transcription, summarization, extraction, and media analysis jobs in one place."
      />

      <Card className="rounded-[1.75rem] bg-surface p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <Clock3 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground">Job queue</h2>
            <p className="mt-1 text-sm text-foreground-muted">
              Monitor every background job powering transcript generation and content intelligence workflows.
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {jobs?.length ? (
            jobs.map((job) => (
              <div key={job.id} className="flex items-center justify-between rounded-2xl border border-border bg-background px-4 py-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">{job.job_type}</p>
                  <p className="mt-1 text-xs text-foreground-muted">
                    {job.resource_type ?? "asset"} {job.resource_id ? `- ${job.resource_id}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  {job.status === "running" ? <LoaderCircle className="h-4 w-4 animate-spin text-primary" /> : null}
                  <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs uppercase tracking-[0.18em] text-foreground-muted">
                    {job.status}
                  </span>
                </div>
              </div>
            ))
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
