"use client";

import { ProviderForm } from "@/components/providers/provider-form";
import { ProviderList } from "@/components/providers/provider-list";
import { SettingsShell } from "@/components/settings/settings-shell";
import { useAdminAccess } from "@/hooks/use-admin-access";

export default function SettingsProvidersPage() {
  const { publicWorkspaceQuery, workspaceAuthDisabled, adminAuthHydrated } = useAdminAccess();

  if (publicWorkspaceQuery.isLoading || (workspaceAuthDisabled && !adminAuthHydrated)) {
    return (
      <SettingsShell
        title="Providers"
        description="Connect transcription and analysis providers for your workspace account."
      >
        <div className="rounded-xl border border-border bg-background-secondary p-4 text-sm text-foreground-muted">
          Loading workspace access...
        </div>
      </SettingsShell>
    );
  }

  return (
    <SettingsShell
      title="Providers"
      description="Connect transcription and analysis providers for your workspace account."
    >
      <div className="mx-auto grid w-full max-w-6xl gap-4 lg:gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <ProviderForm />
        <ProviderList />
      </div>
    </SettingsShell>
  );
}
