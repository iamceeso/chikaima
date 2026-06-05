import { RegisterForm } from "@/components/auth/auth-form";

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen bg-[#202123] text-foreground">
      <section className="hidden flex-1 border-r border-border bg-[#171717] p-12 lg:flex lg:flex-col lg:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Olanma</p>
          <h1 className="mt-4 max-w-lg text-4xl font-semibold tracking-tight">
            Build a private AI workspace that feels as simple as consumer chat tools.
          </h1>
        </div>
        <p className="max-w-md text-sm leading-7 text-zinc-400">
          Connect OpenAI, Anthropic, Gemini, Ollama, and custom endpoints without switching between tools.
        </p>
      </section>
      <section className="flex flex-1 items-center justify-center px-6 py-10">
        <RegisterForm />
      </section>
    </main>
  );
}
