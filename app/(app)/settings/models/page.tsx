"use client";

import { ModelAccessPanel } from "@/components/settings/model-access-panel";
import { SettingsShell } from "@/components/settings/settings-shell";
import { useAdminAccess } from "@/hooks/use-admin-access";

export default function SettingsModelsPage() {
  const { publicWorkspaceQuery, workspaceAuthDisabled, adminAuthHydrated } = useAdminAccess();

  if (publicWorkspaceQuery.isLoading || (workspaceAuthDisabled && !adminAuthHydrated)) {
    return (
      <SettingsShell title="Models" description="Control which synced models are available for your workspace account.">
        <div className="rounded-xl border border-border bg-background-secondary p-4 text-sm text-foreground-muted">
          Loading workspace access...
        </div>
      </SettingsShell>
    );
  }

  return (
    <SettingsShell title="Models" description="Control which synced models are available for your workspace account.">
      <ModelAccessPanel />
    </SettingsShell>
  );
}
