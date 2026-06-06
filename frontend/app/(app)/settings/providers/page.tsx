import { ProviderForm } from "@/components/providers/provider-form";
import { ProviderList } from "@/components/providers/provider-list";
import { SettingsShell } from "@/components/settings/settings-shell";

export default function SettingsProvidersPage() {
  return (
    <SettingsShell
      title="Provider settings"
      description="Connect OpenAI, Claude, Gemini, Ollama, and compatible endpoints for transcription and analysis."
    >
      <div className="mb-6 rounded-2xl border border-border bg-background-secondary p-5">
        <p className="text-sm leading-relaxed text-foreground">
          Provider connections now live under Settings so workspace operations, access control, and AI configuration stay in one place.
        </p>
      </div>
      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <ProviderForm />
        <ProviderList />
      </div>
    </SettingsShell>
  );
}
