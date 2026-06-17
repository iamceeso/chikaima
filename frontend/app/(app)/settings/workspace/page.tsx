"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, ShieldCheck, Trash2, UserCircle2 } from "lucide-react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { AdminAccessGate } from "@/components/settings/admin-access-gate";
import { useAdminAccess } from "@/hooks/use-admin-access";
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

function WorkspaceAccountSection({
  user,
  clearAnalysisPending,
  onClearAnalysis,
}: {
  user: ReturnType<typeof useAuthStore.getState>["user"];
  clearAnalysisPending: boolean;
  onClearAnalysis: () => void;
}) {
  return (
    <Card className="mx-auto w-full max-w-2xl p-6">
      <div className="mb-5 flex items-center gap-3">
        <UserCircle2 className="h-5 w-5 text-primary" />
        <div>
          <h2 className="font-semibold">Account</h2>
          <p className="text-sm text-foreground-muted">Manage your session and personal workspace data.</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-background-secondary p-4">
        <p className="font-medium">{user?.full_name ?? "Your account"}</p>

        {user?.email ? <p className="text-sm text-foreground-muted">{user.email}</p> : null}
      </div>

      <div className="mt-5">
        <SignOutButton redirectTo="/" className="w-full sm:w-auto" />
      </div>

      <div className="mt-6 rounded-xl border border-destructive/30 p-4">
        <h3 className="font-medium text-destructive">Danger Zone</h3>

        <p className="mt-1 text-sm text-foreground-muted">Permanently remove chats, documents, videos and audio.</p>

        <Button
          variant="outline"
          className="mt-4 w-full sm:w-auto"
          onClick={onClearAnalysis}
          disabled={clearAnalysisPending}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {clearAnalysisPending ? "Clearing..." : "Clear Analysis"}
        </Button>
      </div>
    </Card>
  );
}

export default function WorkspaceSettingsPage() {
  const token = useAuthStore((state) => state.tokens?.access_token);
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const { access, hasAdminAccess, publicWorkspaceQuery, workspaceAuthDisabled, adminAuthHydrated } = useAdminAccess();
  const [registrationDialogOpen, setRegistrationDialogOpen] = useState(false);
  const [authenticationDialogOpen, setAuthenticationDialogOpen] = useState(false);
  const [docsDialogOpen, setDocsDialogOpen] = useState(false);
  const [visionAwareDialogOpen, setVisionAwareDialogOpen] = useState(false);
  const [clearAnalysisDialogOpen, setClearAnalysisDialogOpen] = useState(false);

  const workspaceQuery = useQuery({
    queryKey: ["workspace-settings"],
    queryFn: () => {
      if (!access) {
        return Promise.reject(new Error("Administrator access is required."));
      }
      return api.getWorkspaceSettings(access);
    },
    enabled: Boolean(access),
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
      if (!access || !workspaceQuery.data) {
        throw new Error("Workspace settings are unavailable.");
      }
      return api.updateWorkspaceSettings(access, {
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
      if (!access || !workspaceQuery.data) {
        throw new Error("Workspace settings are unavailable.");
      }
      return api.updateWorkspaceSettings(access, {
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
      if (!access || !workspaceQuery.data) {
        throw new Error("Workspace settings are unavailable.");
      }
      return api.updateWorkspaceSettings(access, {
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
      if (!access || !workspaceQuery.data) {
        throw new Error("Workspace settings are unavailable.");
      }
      return api.updateWorkspaceSettings(access, {
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

      for (const conversation of conversations) {
        await api.deleteConversation(token, conversation.id);
      }

      await Promise.all([
        api.clearDocuments(token),
        api.clearAudioAssets(token),
        api.clearVideos(token),
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

  const clearAnalysisDialog = (
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
  );

  if (publicWorkspaceQuery.isLoading || (workspaceAuthDisabled && !adminAuthHydrated)) {
    return (
      <SettingsShell
        title="Workspace"
        description="Manage access, routing, jobs, and account settings."
      >
        <Card className="p-6">
          <p className="text-sm text-foreground-muted">Loading workspace access...</p>
        </Card>
      </SettingsShell>
    );
  }

  if (workspaceAuthDisabled && !hasAdminAccess) {
    return (
      <>
        <SettingsShell
          title="Workspace"
          description="Manage your account and personal workspace data."
        >
          <div className="mx-auto w-full max-w-4xl space-y-6 p-1">
            <WorkspaceAccountSection
              user={user}
              clearAnalysisPending={clearAnalysis.isPending}
              onClearAnalysis={() => setClearAnalysisDialogOpen(true)}
            />
            <AdminAccessGate
              title="Unlock admin controls"
              description="Workspace sign-in is disabled. Enter an administrator email and password only if you need to manage workspace-wide settings."
            />
          </div>
        </SettingsShell>
        {clearAnalysisDialog}
      </>
    );
  }

  if (!hasAdminAccess) {
    return (
      <>
        <SettingsShell
          title="Workspace"
          description="Manage your account and personal workspace data."
        >
          <div className="mx-auto w-full max-w-4xl space-y-6 p-1">
            <WorkspaceAccountSection
              user={user}
              clearAnalysisPending={clearAnalysis.isPending}
              onClearAnalysis={() => setClearAnalysisDialogOpen(true)}
            />
          </div>
        </SettingsShell>
        {clearAnalysisDialog}
      </>
    );
  }

  return (
  <SettingsShell
    title="Workspace"
    description="Manage access, routing, jobs, and account settings."
  >
    <div className="mx-auto w-full max-w-7xl space-y-6 p-1">
      {/* Overview */}
      <Card className="overflow-hidden">
        <div className="border-b border-border p-6">
          <h1 className="text-2xl font-semibold text-foreground">
            Workspace Overview
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Configure workspace access, AI routing, documentation visibility,
            and account operations.
          </p>
        </div>

        <div className="grid gap-4 p-6 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-background-secondary p-5">
            <p className="text-xs uppercase tracking-wider text-foreground-muted">
              Users
            </p>
            <p className="mt-2 text-3xl font-bold">
              {workspaceQuery.data?.total_users ?? 0}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-background-secondary p-5">
            <p className="text-xs uppercase tracking-wider text-foreground-muted">
              Providers
            </p>
            <p className="mt-2 text-3xl font-bold">
              {workspaceQuery.data?.total_providers ?? 0}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-background-secondary p-5">
            <p className="text-xs uppercase tracking-wider text-foreground-muted">
              Queued Jobs
            </p>
            <p className="mt-2 text-3xl font-bold">
              {workspaceQuery.data?.pending_jobs ?? 0}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Security */}
        <Card className="p-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>

            <div>
              <h2 className="font-semibold">Security & Access</h2>
              <p className="text-sm text-foreground-muted">
                Authentication and API visibility.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Authentication */}
            <div className="rounded-xl border border-border p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-medium">Authentication</h3>
                  <p className="text-sm text-foreground-muted">
                    {workspaceQuery.data?.authentication_enabled
                      ? "Sign-in required."
                      : "Workspace can be accessed without login."}
                  </p>
                </div>

                <Button
                  onClick={() => setAuthenticationDialogOpen(true)}
                  disabled={
                    !hasAdminAccess ||
                    workspaceQuery.data?.first_user_registration_required ||
                    toggleAuthentication.isPending ||
                    workspaceQuery.isLoading
                  }
                >
                  {workspaceQuery.data?.authentication_enabled
                    ? "Disable"
                    : "Enable"}
                </Button>
              </div>
            </div>

            {/* API Docs */}
            <div className="rounded-xl border border-border p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-medium">API Documentation</h3>
                  <p className="text-sm text-foreground-muted">
                    Control access to Swagger, ReDoc and OpenAPI.
                  </p>
                </div>

                <Button
                  onClick={() => setDocsDialogOpen(true)}
                  disabled={
                    !hasAdminAccess ||
                    toggleDocs.isPending ||
                    workspaceQuery.isLoading
                  }
                >
                  {workspaceQuery.data?.docs_enabled
                    ? "Disable"
                    : "Enable"}
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Features */}
        <Card className="p-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>

            <div>
              <h2 className="font-semibold">Workspace Features</h2>
              <p className="text-sm text-foreground-muted">
                Registration and model routing.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-border p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-medium">Public Registration</h3>
                  <p className="text-sm text-foreground-muted">
                    Allow users to create accounts.
                  </p>
                </div>

                <Button
                  onClick={() => setRegistrationDialogOpen(true)}
                  disabled={
                    !hasAdminAccess ||
                    toggleRegistration.isPending ||
                    workspaceQuery.isLoading
                  }
                >
                  {workspaceQuery.data?.public_registration_enabled
                    ? "Disable"
                    : "Enable"}
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-border p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-medium">Vision Routing</h3>
                  <p className="text-sm text-foreground-muted">
                    Route image requests to compatible models.
                  </p>
                </div>

                <Button
                  onClick={() => setVisionAwareDialogOpen(true)}
                  disabled={
                    !hasAdminAccess ||
                    toggleVisionAware.isPending ||
                    workspaceQuery.isLoading
                  }
                >
                  {workspaceQuery.data?.vision_aware
                    ? "Disable"
                    : "Enable"}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Jobs */}
        <Card className="p-6">
          <div className="mb-5 flex items-center gap-3">
            <Bell className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Background Jobs</h2>
          </div>

          <div className="space-y-3">
            {jobsQuery.data?.length ? (
              jobsQuery.data.slice(0, 5).map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between rounded-xl border border-border p-4"
                >
                  <div>
                    <p className="font-medium">{job.job_type}</p>
                    <p className="text-xs text-foreground-muted">
                      {job.resource_type ?? "Task"}
                    </p>
                  </div>

                  <span className="rounded-full border px-3 py-1 text-xs uppercase">
                    {job.status}
                  </span>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed p-6 text-center text-sm text-foreground-muted">
                No active jobs
              </div>
            )}
          </div>
        </Card>

        {/* Account */}
        <Card className="p-6">
          <div className="mb-5 flex items-center gap-3">
            <UserCircle2 className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Account</h2>
          </div>

          <div className="rounded-xl border border-border bg-background-secondary p-4">
            <p className="font-medium">
              {user?.full_name ?? "Your account"}
            </p>

            {user?.email && (
              <p className="text-sm text-foreground-muted">
                {user.email}
              </p>
            )}
          </div>

          <div className="mt-5">
            <SignOutButton
              redirectTo="/"
              className="w-full sm:w-auto"
            />
          </div>

          <div className="mt-6 rounded-xl border border-destructive/30 p-4">
            <h3 className="font-medium text-destructive">
              Danger Zone
            </h3>

            <p className="mt-1 text-sm text-foreground-muted">
              Permanently remove chats, documents, videos and audio.
            </p>

            <Button
              variant="outline"
              className="mt-4 w-full sm:w-auto"
              onClick={() => setClearAnalysisDialogOpen(true)}
              disabled={clearAnalysis.isPending}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {clearAnalysis.isPending
                ? "Clearing..."
                : "Clear Analysis"}
            </Button>
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

      {clearAnalysisDialog}

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
