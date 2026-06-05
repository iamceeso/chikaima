import { Topbar } from "@/components/layout/topbar";
import { ProviderForm } from "@/components/providers/provider-form";
import { ProviderList } from "@/components/providers/provider-list";

export default function ProvidersPage() {
  return (
    <>
      <Topbar
        title="Provider management"
        description="Connect cloud APIs, local model endpoints, and OpenAI-compatible gateways to expand your capabilities."
      />
      <div className="mb-6 rounded-lg border border-border bg-background-secondary p-5">
        <p className="text-sm leading-relaxed text-foreground">
          Add and manage all your AI providers in one place. Seamlessly switch between models without leaving your workspace.
        </p>
      </div>
      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <ProviderForm />
        <ProviderList />
      </div>
    </>
  );
}
