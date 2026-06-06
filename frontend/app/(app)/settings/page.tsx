"use client";

import { useQuery } from "@tanstack/react-query";
import { Sliders, Moon, Bell, UserCircle2 } from "lucide-react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth-store";

export default function SettingsPage() {
  const token = useAuthStore((state) => state.tokens?.access_token);
  const user = useAuthStore((state) => state.user);
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
        title="Settings"
        description="Manage workspace defaults, background processing, and appearance"
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sliders className="h-4.5 w-4.5" />
            </div>
            <h2 className="text-base font-semibold text-foreground">Workspace</h2>
          </div>
          <p className="text-sm text-foreground-muted mb-4">
            Configure provider defaults, processing behavior, and workspace preferences.
          </p>
          <div className="space-y-2">
            {[
              "Default model selection",
              "Transcription and summary settings",
              "Profile and storage preferences",
            ].map((item) => (
              <div key={item} className="rounded-lg border border-border bg-background-secondary p-3 text-sm text-foreground">
                {item}
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Moon className="h-4.5 w-4.5" />
            </div>
            <h2 className="text-base font-semibold text-foreground">Appearance</h2>
          </div>
          <p className="text-sm text-foreground-muted">
            Choose between light and dark mode. Your preference applies to the entire workspace.
          </p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <UserCircle2 className="h-4.5 w-4.5" />
            </div>
            <h2 className="text-base font-semibold text-foreground">Profile</h2>
          </div>
          <p className="text-sm text-foreground-muted mb-4">
            Signed in as {user?.full_name ?? "your account"}{user?.email ? ` (${user.email})` : ""}.
          </p>
          <SignOutButton redirectTo="/" className="w-full sm:w-auto" />
        </Card>

        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Bell className="h-4.5 w-4.5" />
            </div>
            <h2 className="text-base font-semibold text-foreground">Background jobs</h2>
          </div>
          <p className="text-sm text-foreground-muted mb-4">Track uploads, processing pipelines, and async media analysis tasks.</p>
          <div className="space-y-2">
            {jobs?.length ? (
              jobs.map((job) => (
                <div key={job.id} className="rounded-lg border border-border bg-background-secondary p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{job.job_type}</p>
                    <p className="text-xs text-foreground-muted mt-0.5">{job.resource_type ?? "Task"}</p>
                  </div>
                  <span className="rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-medium uppercase text-foreground-muted">
                    {job.status}
                  </span>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-background-secondary p-4 text-center text-sm text-foreground-muted">
                No active jobs
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
