import Link from "next/link";

import { Button } from "@/components/ui/button";

const highlights = [
  "Connect OpenAI, Anthropic, Gemini, Ollama, and OpenAI-compatible endpoints",
  "Manage chats, uploads, transcripts, and jobs from one workspace",
  "Deploy locally with Docker, PostgreSQL, Redis, and Celery workers",
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(244,114,182,0.18),transparent_30%),linear-gradient(135deg,#07111f_0%,#0b1b2d_45%,#0d1321_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-10 sm:px-10">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.32em] text-cyan-300">Olanma</p>
            <h1 className="mt-3 max-w-2xl font-(--font-heading) text-5xl tracking-tight sm:text-6xl">
              Your self-hosted AI control room.
            </h1>
          </div>
          <Link
            href="/login"
            className="rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-medium text-slate-100 backdrop-blur transition hover:bg-white/10"
          >
            Sign in
          </Link>
        </header>

        <section className="mt-16 grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-4xl border border-white/10 bg-white/6 p-8 shadow-2xl shadow-cyan-950/30 backdrop-blur-xl">
            <p className="text-sm uppercase tracking-[0.28em] text-cyan-300">Scalable foundation</p>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
              Olanma gives teams one interface for hosted APIs and private local models, with provider
              management, job orchestration, and a dashboard built for serious AI operations.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <Button asChild href="/register" size="lg">
                Create workspace
              </Button>
              <Button asChild href="/dashboard" size="lg" variant="ghost">
                Open demo dashboard
              </Button>
            </div>
          </div>

          <div className="rounded-4xl border border-cyan-400/20 bg-slate-950/70 p-8 shadow-2xl shadow-black/30">
            <p className="text-sm uppercase tracking-[0.28em] text-cyan-300">What ships first</p>
            <div className="mt-6 space-y-4">
              {highlights.map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-7 text-slate-300">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
