"use client";

import { useQuery } from "@tanstack/react-query";

import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth-store";

export default function SettingsPage() {
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
        title="Settings and jobs"
        description="Workspace preferences, upload operations, and asynchronous processing status live here."
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="bg-slate-950/50">
          <h2 className="text-xl font-semibold">Workspace settings</h2>
          <p className="mt-3 text-sm leading-7 text-slate-400">
            Theme, default models, provider-specific options, and profile preferences are modeled in the backend settings table.
          </p>
        </Card>
        <Card className="bg-slate-950/50">
          <h2 className="text-xl font-semibold">Background jobs</h2>
          <div className="mt-4 space-y-3">
            {jobs?.length ? (
              jobs.map((job) => (
                <div key={job.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
                  <p className="font-medium">{job.job_type}</p>
                  <p className="mt-1 text-slate-400">{job.status}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400">No jobs yet. Upload a document, audio clip, or video to queue work.</p>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
