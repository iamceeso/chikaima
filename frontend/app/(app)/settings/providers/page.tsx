import { ProviderForm } from "@/components/providers/provider-form";
import { ProviderList } from "@/components/providers/provider-list";
import { SettingsShell } from "@/components/settings/settings-shell";

export default function SettingsProvidersPage() {
  return (
    <SettingsShell
      title="Providers"
      description="Connect transcription and analysis providers."
    >
      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <ProviderForm />
        <ProviderList />
      </div>
    </SettingsShell>
  );
}
