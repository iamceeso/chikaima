"use client";

import { useQuery } from "@tanstack/react-query";
import { BellRing, MoonStar, SlidersHorizontal } from "lucide-react";

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
      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-4">
          <Card className="bg-[#40414f]">
            <div className="mb-4 flex items-center gap-3">
              <SlidersHorizontal className="h-5 w-5 text-zinc-300" />
              <h2 className="text-xl font-semibold text-foreground">Workspace settings</h2>
            </div>
            <div className="space-y-3">
              {[
                "Default model selection and provider preferences",
                "Response behavior, retrieval, and chat defaults",
                "Workspace-specific profile and usage settings",
              ].map((item) => (
                <div key={item} className="rounded-xl border border-border bg-[#343541] p-4 text-sm text-zinc-300">
                  {item}
                </div>
              ))}
            </div>
          </Card>
          <Card className="bg-[#40414f]">
            <div className="mb-4 flex items-center gap-3">
              <MoonStar className="h-5 w-5 text-zinc-300" />
              <h2 className="text-xl font-semibold text-foreground">Appearance</h2>
            </div>
            <p className="text-sm leading-7 text-zinc-400">
              Dark and light themes are available globally so the whole workspace stays consistent with the chat view.
            </p>
          </Card>
        </div>
        <Card className="bg-[#40414f]">
          <div className="mb-4 flex items-center gap-3">
            <BellRing className="h-5 w-5 text-zinc-300" />
            <h2 className="text-xl font-semibold text-foreground">Background jobs</h2>
          </div>
          <p className="mb-4 text-sm text-zinc-400">Track uploads and async AI processing from one queue-aware panel.</p>
          <div className="space-y-3">
            {jobs?.length ? (
              jobs.map((job) => (
                <div key={job.id} className="rounded-xl border border-border bg-[#343541] p-4 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-medium text-foreground">{job.job_type}</p>
                    <span className="rounded-full border border-border bg-[#40414f] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-zinc-300">
                      {job.status}
                    </span>
                  </div>
                  <p className="mt-2 text-zinc-400">{job.resource_type ?? "general task"}</p>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-[#343541] p-4 text-sm text-zinc-400">
                No jobs yet. Upload a document, audio clip, or video to queue work.
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
