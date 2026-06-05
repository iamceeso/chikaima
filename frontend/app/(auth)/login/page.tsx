import { LoginForm } from "@/components/auth/auth-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen bg-[#202123] text-foreground">
      <section className="hidden flex-1 border-r border-border bg-[#171717] p-12 lg:flex lg:flex-col lg:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Olanma</p>
          <h1 className="mt-4 max-w-lg text-4xl font-semibold tracking-tight">
            One workspace for cloud APIs, local models, and operational AI workflows.
          </h1>
        </div>
        <p className="max-w-md text-sm leading-7 text-zinc-400">
          Chat, upload, summarize, transcribe, and manage providers from a single dashboard modeled for focused daily
          use.
        </p>
      </section>
      <section className="flex flex-1 items-center justify-center px-6 py-10">
        <LoginForm />
      </section>
    </main>
  );
}
