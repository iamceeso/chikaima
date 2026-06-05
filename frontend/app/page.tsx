import { ArrowRight, Bot, Database, FileUp, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

const highlights = [
  {
    icon: Bot,
    title: "Unified chat",
    copy: "Talk to OpenAI, Claude, Gemini, Ollama, and local models from one interface.",
  },
  {
    icon: FileUp,
    title: "Built-in analysis",
    copy: "Upload documents, audio, and video into one operational workspace.",
  },
  {
    icon: Database,
    title: "Self-hosted stack",
    copy: "Run the full platform with FastAPI, PostgreSQL, Redis, Docker, and Celery.",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#202123] text-foreground">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8 sm:px-10">
        <header className="flex items-center justify-between border-b border-border pb-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">Olanma</p>
            <h1 className="mt-2 text-lg font-medium">Self-hosted AI workspace</h1>
          </div>
          <Button asChild href="/login" variant="ghost">
            Sign in
          </Button>
        </header>

        <section className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-[#2a2b32] px-3 py-1 text-xs text-zinc-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              Private-by-default AI operations
            </div>
            <h2 className="mt-6 max-w-3xl font-[family:var(--font-heading)] text-5xl font-semibold tracking-tight sm:text-6xl">
              Use ChatGPT-like workflows across every model you run.
            </h2>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-400">
              Olanma gives your team one place to chat, upload, summarize, transcribe, and orchestrate AI work
              without bouncing between vendors or tools.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild href="/register" size="lg">
                Create workspace
              </Button>
              <Button asChild href="/chat" size="lg" variant="ghost">
                Open chat
              </Button>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-border bg-[#2f3037] p-5">
            <div className="rounded-2xl border border-border bg-[#343541] p-5">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <p className="text-sm font-medium">Olanma workspace</p>
                  <p className="mt-1 text-xs text-zinc-500">Chat, providers, uploads, and jobs</p>
                </div>
                <ArrowRight className="h-4 w-4 text-zinc-500" />
              </div>
              <div className="mt-4 space-y-3">
                {highlights.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.title} className="flex gap-3 rounded-xl border border-border bg-[#40414f] p-4">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#202123]">
                        <Icon className="h-4 w-4 text-zinc-300" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{item.title}</p>
                        <p className="mt-1 text-sm leading-6 text-zinc-400">{item.copy}</p>
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
