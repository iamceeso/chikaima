import { LoginForm } from "@/components/auth/auth-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen bg-background">
      <section className="hidden flex-1 border-r border-border bg-surface p-12 lg:flex lg:flex-col lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">Olanma</p>
          <h1 className="text-5xl font-semibold leading-tight text-foreground max-w-lg">
            Your all-in-one AI workspace.
          </h1>
        </div>
        <p className="text-base leading-relaxed text-foreground-muted max-w-md">
          Connect every AI provider you use and keep chat-specific records organized across the workspace.
        </p>
      </section>
      <section className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm">
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
