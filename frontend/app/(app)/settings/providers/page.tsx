"use client";

import { AdminAccessGate } from "@/components/settings/admin-access-gate";
import { ProviderForm } from "@/components/providers/provider-form";
import { ProviderList } from "@/components/providers/provider-list";
import { SettingsShell } from "@/components/settings/settings-shell";
import { useAdminAccess } from "@/hooks/use-admin-access";

export default function SettingsProvidersPage() {
  const { hasAdminAccess, publicWorkspaceQuery, workspaceAuthDisabled, adminAuthHydrated } = useAdminAccess();

  if (publicWorkspaceQuery.isLoading || (workspaceAuthDisabled && !adminAuthHydrated)) {
    return (
      <SettingsShell
        title="Providers"
        description="Connect transcription and analysis providers."
      >
        <div className="rounded-xl border border-border bg-background-secondary p-4 text-sm text-foreground-muted">
          Loading workspace access...
        </div>
      </SettingsShell>
    );
  }

  if (workspaceAuthDisabled && !hasAdminAccess) {
    return (
      <SettingsShell
        title="Providers"
        description="Connect transcription and analysis providers."
      >
        <AdminAccessGate
          title="Admin credentials required"
          description="Workspace sign-in is disabled, so changing provider connections requires an existing administrator email and password."
        />
      </SettingsShell>
    );
  }

  if (!hasAdminAccess) {
    return (
      <SettingsShell
        title="Providers"
        description="Connect transcription and analysis providers."
      >
        <div className="rounded-xl border border-border bg-background-secondary p-4 text-sm text-foreground-muted">
          You need an admin account to manage workspace providers.
        </div>
      </SettingsShell>
    );
  }

  return (
    <SettingsShell
      title="Providers"
      description="Connect transcription and analysis providers."
    >
      <div className="mx-auto grid w-full max-w-6xl gap-4 lg:gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <ProviderForm />
        <ProviderList />
      </div>
    </SettingsShell>
  );
}
