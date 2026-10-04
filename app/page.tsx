"use client";

import { Code2, GitPullRequestArrow, ShieldCheck, Users } from "lucide-react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/auth-store";

const highlights = [
  {
    icon: Code2,
    title: "A development environment in the browser",
    copy: "Files, editor, terminal, live preview and git for your project, wherever Chikaima runs.",
  },
  {
    icon: Users,
    title: "An AI engineering team",
    copy: "A lead, engineers, reviewers and testers on the models you choose, each with a role and limits.",
  },
  {
    icon: GitPullRequestArrow,
    title: "You stay the supervisor",
    copy: "Agents review and test each other's work; risky actions and merges wait for your approval.",
  },
];

export default function HomePage() {
  const tokens = useAuthStore((state) => state.tokens);
  const isAuthenticated = Boolean(tokens?.access_token);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4 py-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-foreground">Chikaima</p>
          {isAuthenticated ? (
            <div className="flex items-center gap-3">
              <Button asChild href="/projects" variant="outline" size="sm">
                Open projects
              </Button>
              <SignOutButton className="h-9 rounded-lg px-3.5" />
            </div>
          ) : (
            <Button asChild href="/login" variant="outline" size="sm">
              Sign in
            </Button>
          )}
        </header>

        <section className="grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-md border border-border bg-background-secondary px-2.5 py-1 text-xs font-medium text-foreground-muted">
              <ShieldCheck className="h-3.5 w-3.5" /> Self-hosted · any model provider
            </div>
            <h1 className="mb-4 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">Build software with your AI engineering team</h1>
            <p className="mb-8 max-w-lg text-base leading-relaxed text-foreground-muted">
              Open a project, assemble specialised AI agents, and build, test and review software together directly from your browser.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild href={isAuthenticated ? "/projects/new" : "/register"} className="px-5">
                {isAuthenticated ? "New project" : "Get started"}
              </Button>
              <Button asChild href={isAuthenticated ? "/projects" : "/login"} variant="outline" className="px-5">
                {isAuthenticated ? "Open a project" : "Sign in"}
              </Button>
            </div>
          </div>

          <div className="space-y-2.5">
            {highlights.map((item) => (
              <div key={item.title} className="flex gap-3 rounded-lg border border-border bg-surface p-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/12 text-primary">
                  <item.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{item.title}</p>
                  <p className="mt-0.5 text-[13px] leading-snug text-foreground-muted">{item.copy}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
