import { Topbar } from "@/components/layout/topbar";
import { ProviderForm } from "@/components/providers/provider-form";
import { ProviderList } from "@/components/providers/provider-list";

export default function ProvidersPage() {
  return (
    <>
      <Topbar
        title="Provider management"
        description="Connect transcription and reasoning providers for media analysis workflows."
      />
      <div className="mb-6 rounded-lg border border-border bg-background-secondary p-5">
        <p className="text-sm leading-relaxed text-foreground">
          Add the providers used for transcription, summarization, transcript Q&A, and media enrichment.
        </p>
      </div>
      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <ProviderForm />
        <ProviderList />
      </div>
    </>
  );
}
