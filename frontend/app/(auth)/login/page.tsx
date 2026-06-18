import { LoginForm } from "@/components/auth/auth-form";
import Image from "next/image";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen bg-background">
      <section className="hidden flex-1 border-r border-border bg-surface p-12 lg:flex lg:flex-col lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">
            Chikaima
          </p>
          <h1 className="text-5xl font-semibold leading-tight text-foreground max-w-lg">
            Self-hosted intelligence workspace.
          </h1>
        </div>
        <Image
          src="/chikaima-logo.png"
          alt="Chikaima logo"
          width={300}
          height={300}
          draggable={false}
          className="mx-auto select-none pointer-events-none"
        />
        <p className="text-base leading-relaxed text-foreground-muted max-w-md">
          Connect transcription and reasoning providers, then turn recordings
          and documents into searchable knowledge.
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
