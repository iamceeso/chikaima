"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, ShieldCheck, Trash2, UserCircle2 } from "lucide-react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { libraryQueryKey } from "@/lib/library";
import { SettingsShell } from "@/components/settings/settings-shell";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth-store";

export default function WorkspaceSettingsPage() {
  const token = useAuthStore((state) => state.tokens?.access_token);
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const [registrationDialogOpen, setRegistrationDialogOpen] = useState(false);
  const [authenticationDialogOpen, setAuthenticationDialogOpen] = useState(false);
  const [docsDialogOpen, setDocsDialogOpen] = useState(false);
  const [visionAwareDialogOpen, setVisionAwareDialogOpen] = useState(false);
  const [clearAnalysisDialogOpen, setClearAnalysisDialogOpen] = useState(false);

  const workspaceQuery = useQuery({
    queryKey: ["workspace-settings"],
    queryFn: () => {
      if (!token) {
        return Promise.reject(new Error("Please sign in first."));
      }
      return api.getWorkspaceSettings(token);
    },
    enabled: Boolean(token),
    staleTime: 5 * 60_000,
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
        public_registration_enabled: !workspaceQuery.data.public_registration_enabled,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workspace-settings"] });
      await queryClient.invalidateQueries({ queryKey: ["public-workspace-settings"] });
    },
  });

  const toggleAuthentication = useMutation({
    mutationFn: async () => {
      if (!token || !workspaceQuery.data) {
        throw new Error("Workspace settings are unavailable.");
      }
      return api.updateWorkspaceSettings(token, {
        authentication_enabled: !workspaceQuery.data.authentication_enabled,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workspace-settings"] });
      await queryClient.invalidateQueries({ queryKey: ["public-workspace-settings"] });
    },
  });

  const toggleDocs = useMutation({
    mutationFn: async () => {
      if (!token || !workspaceQuery.data) {
        throw new Error("Workspace settings are unavailable.");
      }
      return api.updateWorkspaceSettings(token, {
        docs_enabled: !workspaceQuery.data.docs_enabled,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workspace-settings"] });
      await queryClient.invalidateQueries({ queryKey: ["public-workspace-settings"] });
    },
  });

  const toggleVisionAware = useMutation({
    mutationFn: async () => {
      if (!token || !workspaceQuery.data) {
        throw new Error("Workspace settings are unavailable.");
      }
      return api.updateWorkspaceSettings(token, {
        vision_aware: !workspaceQuery.data.vision_aware,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workspace-settings"] });
    },
  });

  const clearAnalysis = useMutation({
    mutationFn: async () => {
      if (!token) {
        throw new Error("Please sign in first.");
      }

      const conversations = await api.getConversations(token);

      await Promise.all([
        api.clearDocuments(token),
        api.clearAudioAssets(token),
        api.clearVideos(token),
        ...conversations.map((conversation) => api.deleteConversation(token, conversation.id)),
      ]);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["conversations"] }),
        queryClient.invalidateQueries({ queryKey: libraryQueryKey }),
        queryClient.invalidateQueries({ queryKey: ["jobs"] }),
      ]);
    },
  });

  return (
    <SettingsShell title="Workspace" description="Manage access, jobs, and your account.">
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h2 className="text-base font-semibold text-foreground">Access</h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {/* <div className="rounded-2xl border border-border bg-background-secondary p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Name</p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {workspaceQuery.data?.name ?? "Loading..."}
              </p>
            </div> */}
            <div className="rounded-2xl border border-border bg-background-secondary p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Users</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{workspaceQuery.data?.total_users ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-border bg-background-secondary p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Providers</p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {workspaceQuery.data?.total_providers ?? 0}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-background-secondary p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Queued jobs</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{workspaceQuery.data?.pending_jobs ?? 0}</p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-border bg-background p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">Public registration</p>
                  <span className="rounded-full border border-border bg-background-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground-muted">
                    {workspaceQuery.data?.public_registration_enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-foreground-muted">
                  {workspaceQuery.data?.public_registration_enabled ? "Enabled" : "Disabled"}
                </p>
              </div>
              <Button
                type="button"
                onClick={() => setRegistrationDialogOpen(true)}
                disabled={!user?.is_superuser || toggleRegistration.isPending || workspaceQuery.isLoading}
                className="w-[16rem] min-w-[16rem] max-w-[16rem] justify-center whitespace-nowrap"
              >
                {workspaceQuery.data?.public_registration_enabled ? "Disable registration" : "Enable registration"}
              </Button>
            </div>
            {!user?.is_superuser ? <p className="mt-3 text-xs text-foreground-muted">Admin only.</p> : null}
            {toggleRegistration.error ? (
              <p className="mt-3 text-sm text-primary">{toggleRegistration.error.message}</p>
            ) : null}
          </div>

          <div className="mt-4 rounded-2xl border border-border bg-background p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">Authentication</p>
                  <span className="rounded-full border border-border bg-background-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground-muted">
                    {workspaceQuery.data?.authentication_enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-foreground-muted">
                  {workspaceQuery.data?.first_user_registration_required
                    ? "Create the first user account before changing authentication rules."
                    : workspaceQuery.data?.authentication_enabled
                      ? "Sign-in is required for workspace access."
                      : "Workspace access is open without login."}
                </p>
              </div>
              <Button
                type="button"
                onClick={() => setAuthenticationDialogOpen(true)}
                disabled={!user?.is_superuser || workspaceQuery.data?.first_user_registration_required || toggleAuthentication.isPending || workspaceQuery.isLoading}
                className="w-[16rem] min-w-[16rem] max-w-[16rem] justify-center whitespace-nowrap"
              >
                {workspaceQuery.data?.authentication_enabled ? "Disable authentication" : "Enable authentication"}
              </Button>
            </div>
            {!user?.is_superuser ? <p className="mt-3 text-xs text-foreground-muted">Admin only.</p> : null}
            {toggleAuthentication.error ? (
              <p className="mt-3 text-sm text-primary">{toggleAuthentication.error.message}</p>
            ) : null}
          </div>

          <div className="mt-4 rounded-2xl border border-border bg-background p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">API docs</p>
                  <span className="rounded-full border border-border bg-background-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground-muted">
                    {workspaceQuery.data?.docs_enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-foreground-muted">
                  {workspaceQuery.data?.docs_enabled
                    ? "Swagger UI, ReDoc, and OpenAPI schema are publicly reachable."
                    : "Docs are hidden from public access by default."}
                </p>
              </div>
              <Button
                type="button"
                onClick={() => setDocsDialogOpen(true)}
                disabled={!user?.is_superuser || toggleDocs.isPending || workspaceQuery.isLoading}
                className="w-[16rem] min-w-[16rem] max-w-[16rem] justify-center whitespace-nowrap"
              >
                {workspaceQuery.data?.docs_enabled ? "Disable docs" : "Enable docs"}
              </Button>
            </div>
            <p className="mt-3 text-xs text-foreground-muted">
              Paths affected: <span className="font-mono">/docs</span>, <span className="font-mono">/redoc</span>, and <span className="font-mono">/api/v1/openapi.json</span>.
            </p>
            {!user?.is_superuser ? <p className="mt-3 text-xs text-foreground-muted">Admin only.</p> : null}
            {toggleDocs.error ? <p className="mt-3 text-sm text-primary">{toggleDocs.error.message}</p> : null}
          </div>

          <div className="mt-4 rounded-2xl border border-border bg-background p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">Vision aware routing</p>
                  <span className="rounded-full border border-border bg-background-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground-muted">
                    {workspaceQuery.data?.vision_aware ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-foreground-muted">
                  {workspaceQuery.data?.vision_aware
                    ? "If a non-vision model is selected for an image request, Olanma can automatically use a vision-capable model from the same provider."
                    : "Olanma will only use the exact model selected, even when image analysis would benefit from a vision-capable variant."}
                </p>
              </div>
              <Button
                type="button"
                onClick={() => setVisionAwareDialogOpen(true)}
                disabled={!user?.is_superuser || toggleVisionAware.isPending || workspaceQuery.isLoading}
                className="w-[16rem] min-w-[16rem] max-w-[16rem] justify-center whitespace-nowrap"
              >
                {workspaceQuery.data?.vision_aware ? "Disable vision aware" : "Enable vision aware"}
              </Button>
            </div>
            <p className="mt-3 text-xs text-foreground-muted">
              When enabled, image attachments can automatically route to a compatible vision model from the same provider while keeping the selected model as the conversation default.
            </p>
            {!user?.is_superuser ? <p className="mt-3 text-xs text-foreground-muted">Admin only.</p> : null}
            {toggleVisionAware.error ? <p className="mt-3 text-sm text-primary">{toggleVisionAware.error.message}</p> : null}
          </div>
        </Card>

        <div className="grid gap-6">
          <Card className="p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <UserCircle2 className="h-4.5 w-4.5" />
              </div>
              <h2 className="text-base font-semibold text-foreground">Profile</h2>
            </div>
            <div className="mb-4 rounded-xl border border-border bg-background-secondary px-4 py-3 text-sm text-foreground-muted">
              {user?.full_name ?? "Your account"}
              {user?.email ? ` (${user.email})` : ""}
            </div>
            <div className="space-y-3">
              <SignOutButton redirectTo="/" className="w-full sm:w-auto" />
              <Button
                type="button"
                variant="outline"
                className="w-full justify-center text-primary hover:bg-primary/5 sm:w-auto"
                onClick={() => setClearAnalysisDialogOpen(true)}
                disabled={clearAnalysis.isPending}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {clearAnalysis.isPending ? "Clearing analysis..." : "Clear all analysis"}
              </Button>
            </div>
            {clearAnalysis.error ? <p className="mt-3 text-sm text-primary">{clearAnalysis.error.message}</p> : null}
          </Card>

          <Card className="p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Bell className="h-4.5 w-4.5" />
              </div>
              <h2 className="text-base font-semibold text-foreground">Background jobs</h2>
            </div>
            <div className="space-y-2">
              {jobsQuery.data?.length ? (
                jobsQuery.data.slice(0, 5).map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center justify-between rounded-xl border border-border bg-background-secondary p-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{job.job_type}</p>
                      <p className="text-xs text-foreground-muted">{job.resource_type ?? "Task"}</p>
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

      <AlertDialog
        open={visionAwareDialogOpen}
        onOpenChange={(open) => {
          if (!toggleVisionAware.isPending) {
            setVisionAwareDialogOpen(open);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {workspaceQuery.data?.vision_aware ? "Disable vision aware routing?" : "Enable vision aware routing?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {workspaceQuery.data?.vision_aware
                ? "Image requests will stay on the exact selected model, even if that model cannot analyze images directly."
                : "Olanma will be allowed to use a vision-capable model from the same provider when image analysis is needed."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="border border-border"
              disabled={toggleVisionAware.isPending}
              onClick={() => setVisionAwareDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={toggleVisionAware.isPending}
              onClick={() =>
                toggleVisionAware.mutate(undefined, {
                  onSuccess: async () => {
                    setVisionAwareDialogOpen(false);
                    await queryClient.invalidateQueries({ queryKey: ["workspace-settings"] });
                  },
                })
              }
            >
              {toggleVisionAware.isPending
                ? "Saving..."
                : workspaceQuery.data?.vision_aware
                  ? "Disable vision aware"
                  : "Enable vision aware"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={clearAnalysisDialogOpen}
        onOpenChange={(open) => {
          if (!clearAnalysis.isPending) {
            setClearAnalysisDialogOpen(open);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all analysis?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove every chat, document, audio file, and video in your workspace library for this account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="border border-border"
              disabled={clearAnalysis.isPending}
              onClick={() => setClearAnalysisDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={clearAnalysis.isPending}
              onClick={() =>
                clearAnalysis.mutate(undefined, {
                  onSuccess: async () => {
                    setClearAnalysisDialogOpen(false);
                    await queryClient.invalidateQueries({ queryKey: ["workspace-settings"] });
                  },
                })
              }
            >
              {clearAnalysis.isPending ? "Clearing..." : "Clear all analysis"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={registrationDialogOpen}
        onOpenChange={(open) => {
          if (!toggleRegistration.isPending) {
            setRegistrationDialogOpen(open);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {workspaceQuery.data?.public_registration_enabled
                ? "Disable public registration?"
                : "Enable public registration?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {workspaceQuery.data?.public_registration_enabled
                ? "New users will no longer be able to sign up on their own. Only admins will be able to create accounts."
                : "Anyone with the registration page will be able to create an account in this workspace."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="border border-border"
              disabled={toggleRegistration.isPending}
              onClick={() => setRegistrationDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={toggleRegistration.isPending}
              onClick={() =>
                toggleRegistration.mutate(undefined, {
                  onSuccess: async () => {
                    setRegistrationDialogOpen(false);
                    await queryClient.invalidateQueries({ queryKey: ["workspace-settings"] });
                  },
                })
              }
            >
              {toggleRegistration.isPending
                ? "Saving..."
                : workspaceQuery.data?.public_registration_enabled
                  ? "Disable registration"
                  : "Enable registration"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={authenticationDialogOpen}
        onOpenChange={(open) => {
          if (!toggleAuthentication.isPending) {
            setAuthenticationDialogOpen(open);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {workspaceQuery.data?.authentication_enabled
                ? "Disable authentication?"
                : "Enable authentication?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {workspaceQuery.data?.authentication_enabled
                ? "Users will be able to open the workspace without signing in. Keep this disabled only for trusted private deployments."
                : "Users will need to sign in again before accessing the workspace."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="border border-border"
              disabled={toggleAuthentication.isPending}
              onClick={() => setAuthenticationDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={toggleAuthentication.isPending}
              onClick={() =>
                toggleAuthentication.mutate(undefined, {
                  onSuccess: async () => {
                    setAuthenticationDialogOpen(false);
                    await queryClient.invalidateQueries({ queryKey: ["workspace-settings"] });
                  },
                })
              }
            >
              {toggleAuthentication.isPending
                ? "Saving..."
                : workspaceQuery.data?.authentication_enabled
                  ? "Disable authentication"
                  : "Enable authentication"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={docsDialogOpen}
        onOpenChange={(open) => {
          if (!toggleDocs.isPending) {
            setDocsDialogOpen(open);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {workspaceQuery.data?.docs_enabled ? "Disable API docs?" : "Enable API docs?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {workspaceQuery.data?.docs_enabled
                ? "Swagger, ReDoc, and the OpenAPI schema will become unavailable to public visitors."
                : "Swagger, ReDoc, and the OpenAPI schema will become reachable from the public app URLs."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="border border-border"
              disabled={toggleDocs.isPending}
              onClick={() => setDocsDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={toggleDocs.isPending}
              onClick={() =>
                toggleDocs.mutate(undefined, {
                  onSuccess: async () => {
                    setDocsDialogOpen(false);
                    await queryClient.invalidateQueries({ queryKey: ["workspace-settings"] });
                  },
                })
              }
            >
              {toggleDocs.isPending
                ? "Saving..."
                : workspaceQuery.data?.docs_enabled
                  ? "Disable docs"
                  : "Enable docs"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsShell>
  );
}
