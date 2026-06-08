import { ProviderForm } from "@/components/providers/provider-form";
import { ProviderList } from "@/components/providers/provider-list";
import { SettingsShell } from "@/components/settings/settings-shell";

export default function SettingsProvidersPage() {
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
