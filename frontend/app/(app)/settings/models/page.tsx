"use client";

import { AdminAccessGate } from "@/components/settings/admin-access-gate";
import { ModelAccessPanel } from "@/components/settings/model-access-panel";
import { SettingsShell } from "@/components/settings/settings-shell";
import { useAdminAccess } from "@/hooks/use-admin-access";

export default function SettingsModelsPage() {
  const { hasAdminAccess, publicWorkspaceQuery, workspaceAuthDisabled, adminAuthHydrated } = useAdminAccess();

  if (publicWorkspaceQuery.isLoading || (workspaceAuthDisabled && !adminAuthHydrated)) {
    return (
      <SettingsShell title="Models" description="Control which synced models are available across the workspace.">
        <div className="rounded-xl border border-border bg-background-secondary p-4 text-sm text-foreground-muted">
          Loading workspace access...
        </div>
      </SettingsShell>
    );
  }

  if (workspaceAuthDisabled && !hasAdminAccess) {
    return (
      <SettingsShell title="Models" description="Control which synced models are available across the workspace.">
        <AdminAccessGate
          title="Admin credentials required"
          description="Workspace sign-in is disabled, so managing model availability requires an existing administrator email and password."
        />
      </SettingsShell>
    );
  }

  if (!hasAdminAccess) {
    return (
      <SettingsShell title="Models" description="Control which synced models are available across the workspace.">
        <div className="rounded-xl border border-border bg-background-secondary p-4 text-sm text-foreground-muted">
          You need an admin account to manage workspace models.
        </div>
      </SettingsShell>
    );
  }

  return (
    <SettingsShell title="Models" description="Control which synced models are available across the workspace.">
      <ModelAccessPanel />
    </SettingsShell>
  );
}
