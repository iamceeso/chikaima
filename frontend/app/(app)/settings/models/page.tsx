import { ModelAccessPanel } from "@/components/settings/model-access-panel";
import { SettingsShell } from "@/components/settings/settings-shell";

export default function SettingsModelsPage() {
  return (
    <SettingsShell title="Models" description="Control which synced models are available across the workspace.">
      <ModelAccessPanel />
    </SettingsShell>
  );
}
