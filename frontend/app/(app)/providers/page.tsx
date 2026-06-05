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
      <div className="mb-6 rounded-2xl border border-border bg-[#40414f] p-5">
        <p className="text-sm leading-7 text-zinc-300">
          This page mirrors the “tools drawer” feel of ChatGPT-style workspaces: setup on the left, connected systems
          on the right, with minimal ceremony between adding a provider and using it in chat.
        </p>
      </div>
      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <ProviderForm />
        <ProviderList />
      </div>
    </>
  );
}
