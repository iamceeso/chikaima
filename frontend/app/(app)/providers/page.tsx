import { Topbar } from "@/components/layout/topbar";
import { ProviderForm } from "@/components/providers/provider-form";
import { ProviderList } from "@/components/providers/provider-list";

export default function ProvidersPage() {
  return (
    <>
      <Topbar
        title="Provider management"
        description="Add cloud APIs, local model endpoints, and OpenAI-compatible gateways from one page."
      />
      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <ProviderForm />
        <ProviderList />
      </div>
    </>
  );
}
