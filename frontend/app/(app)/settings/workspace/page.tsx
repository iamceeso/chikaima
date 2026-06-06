"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, ShieldCheck, UserCircle2 } from "lucide-react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { SettingsShell } from "@/components/settings/settings-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth-store";

export default function WorkspaceSettingsPage() {
  const token = useAuthStore((state) => state.tokens?.access_token);
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();

  const workspaceQuery = useQuery({
    queryKey: ["workspace-settings"],
    queryFn: () => {
      if (!token) {
        return Promise.reject(new Error("Please sign in first."));
      }
      return api.getWorkspaceSettings(token);
    },
    enabled: Boolean(token),
  });

  const jobsQuery = useQuery({
    queryKey: ["jobs"],
    queryFn: () => {
      if (!token) {
        return Promise.resolve([]);
      }
      return api.getJobs(token);
    },
    enabled: Boolean(token),
  });

  const toggleRegistration = useMutation({
    mutationFn: async () => {
      if (!token || !workspaceQuery.data) {
        throw new Error("Workspace settings are unavailable.");
      }
      return api.updateWorkspaceSettings(token, {
        public_registration_enabled:
          !workspaceQuery.data.public_registration_enabled,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workspace-settings"] });
    },
  });

  return (
    <SettingsShell
      title="Workspace"
      description="Manage access, jobs, and your account."
    >
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h2 className="text-base font-semibold text-foreground">Access</h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-border bg-background-secondary p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">
                Name
              </p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {workspaceQuery.data?.name ?? "Loading..."}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-background-secondary p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">
                Users
              </p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {workspaceQuery.data?.total_users ?? 0}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-background-secondary p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">
                Providers
              </p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {workspaceQuery.data?.total_providers ?? 0}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-background-secondary p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">
                Queued jobs
              </p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {workspaceQuery.data?.pending_jobs ?? 0}
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-border bg-background p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Public registration
                </p>
                <p className="mt-1 text-sm text-foreground-muted">
                  {workspaceQuery.data?.public_registration_enabled
                    ? "Enabled"
                    : "Disabled"}
                </p>
              </div>
              <Button
                type="button"
                onClick={() => toggleRegistration.mutate()}
                disabled={
                  !user?.is_superuser ||
                  toggleRegistration.isPending ||
                  workspaceQuery.isLoading
                }
              >
                {workspaceQuery.data?.public_registration_enabled
                  ? "Disable registration"
                  : "Enable registration"}
              </Button>
            </div>
            {!user?.is_superuser ? (
              <p className="mt-3 text-xs text-foreground-muted">Admin only.</p>
            ) : null}
            {toggleRegistration.error ? (
              <p className="mt-3 text-sm text-primary">
                {toggleRegistration.error.message}
              </p>
            ) : null}
          </div>
        </Card>

        <div className="grid gap-6">
          <Card className="p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <UserCircle2 className="h-4.5 w-4.5" />
              </div>
              <h2 className="text-base font-semibold text-foreground">
                Profile
              </h2>
            </div>
            <div className="mb-4 rounded-xl border border-border bg-background-secondary px-4 py-3 text-sm text-foreground-muted">
              {user?.full_name ?? "Your account"}
              {user?.email ? ` (${user.email})` : ""}
            </div>
            <SignOutButton redirectTo="/" className="w-full sm:w-auto" />
          </Card>

          <Card className="p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Bell className="h-4.5 w-4.5" />
              </div>
              <h2 className="text-base font-semibold text-foreground">
                Background jobs
              </h2>
            </div>
            <div className="space-y-2">
              {jobsQuery.data?.length ? (
                jobsQuery.data.slice(0, 5).map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center justify-between rounded-xl border border-border bg-background-secondary p-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {job.job_type}
                      </p>
                      <p className="text-xs text-foreground-muted">
                        {job.resource_type ?? "Task"}
                      </p>
                    </div>
                    <span className="rounded-full border border-border bg-background px-2.5 py-0.5 text-xs uppercase text-foreground-muted">
                      {job.status}
                    </span>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-background-secondary p-4 text-sm text-foreground-muted">
                  No jobs
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </SettingsShell>
  );
}
