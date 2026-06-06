import { AudioLines, FileText, ShieldCheck, Video } from "lucide-react";

import { Button } from "@/components/ui/button";

const highlights = [
  {
    icon: AudioLines,
    title: "Audio transcription",
    copy: "Turn meetings, voice notes, and podcasts into searchable transcripts.",
  },
  {
    icon: Video,
    title: "Video intelligence",
    copy: "Transcribe long-form video, generate summaries, and extract key moments.",
  },
  {
    icon: FileText,
    title: "Document analysis",
    copy: "Summarize PDFs and extract structured knowledge from uploaded content.",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="py-8 sm:py-12 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted mb-1">Olanma</p>
            <h1 className="text-xl sm:text-2xl font-semibold">Media intelligence workspace</h1>
          </div>
          <Button asChild href="/login" variant="outline" size="sm">
            Sign in
          </Button>
        </header>

        <section className="py-16 sm:py-24 grid gap-12 lg:grid-cols-2 items-center">
          <div className="flex flex-col">
            <div className="mb-6 inline-flex items-center gap-2 rounded-lg border border-border bg-background-secondary px-3 py-1.5 text-xs font-medium text-foreground-muted w-fit">
              <ShieldCheck className="h-3.5 w-3.5" />
              Private by default
            </div>
            <h2 className="text-4xl sm:text-5xl font-semibold leading-tight mb-5 tracking-tight">
              Understand audio, video, and documents in one self-hosted workspace.
            </h2>
            <p className="text-sm sm:text-base leading-relaxed text-foreground-muted max-w-lg mb-8">
              Upload media, transcribe it, summarize it, extract key points, and ask questions across the results.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild href="/register" size="default" className="px-5">
                Get started
              </Button>
              <Button asChild href="/library" size="default" variant="outline" className="px-5">
                Open library
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-center lg:justify-end">
            <div className="w-full max-w-sm rounded-2xl border border-border bg-surface-raised p-6 space-y-4 shadow-sm">
              <div>
                <p className="font-semibold text-sm text-foreground">Core workflows</p>
                <p className="text-xs text-foreground-muted mt-1">Focused on content understanding</p>
              </div>
              <div className="space-y-2.5">
                {highlights.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.title} className="flex gap-3 rounded-lg border border-border bg-surface p-3 transition-colors hover:bg-(--surface-strong)/50">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{item.title}</p>
                        <p className="text-xs text-foreground-muted mt-0.5 leading-snug">{item.copy}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
