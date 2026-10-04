"use client";

import Image from "next/image";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Code2, Files, FolderGit2, GitBranch, KanbanSquare, Moon, PanelRight, Plus, Search, Settings2, Sparkles, SunMedium, Users } from "lucide-react";

import { AdminAccessGate } from "@/components/settings/admin-access-gate";
import { useAdminAccess } from "@/hooks/use-admin-access";
import { useTheme } from "@/hooks/use-theme";
import { useLastProject } from "@/lib/last-project";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";

function EmptyPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground-muted">{title}</div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
    </div>
  );
}

export default function WorkspacePage() {
  const { access, hasAdminAccess, workspaceAuthDisabled } = useAdminAccess();
  const lastProject = useLastProject();
  const { theme, setTheme } = useTheme();
  const projectsQuery = useQuery({ queryKey: ["collab-projects"], queryFn: () => api.getProjects(access!), enabled: Boolean(access), staleTime: 30_000 });
  const projects = projectsQuery.data ?? [];
  const recent = projects.find((project) => project.id === lastProject) ?? projects[0] ?? null;

  if (!hasAdminAccess || !access) {
    return workspaceAuthDisabled ? (
      <div className="mx-auto max-w-md pt-16">
        <AdminAccessGate title="Administrator access required" description="The workspace can run code and AI agents on this server, so only administrators can open it." />
      </div>
    ) : (
      <div className="flex h-screen items-center justify-center bg-background p-6 text-sm text-foreground-muted">Only administrators can open the workspace.</div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 text-xs">
        <Link href="/workspace" className="flex items-center gap-1.5" title="Workspace">
          <Image src="/chikaima-logo.png" alt="Chikaima" width={18} height={18} className="h-4.5 w-4.5 object-contain" />
          <span className="hidden text-[11px] font-semibold uppercase tracking-[0.2em] sm:inline">Chikaima</span>
        </Link>
        <span className="text-muted">/</span>
        <span className="text-[13px] font-semibold">Workspace</span>
        {recent ? (
          <Link href={`/projects/${recent.id}`} className="ml-2 hidden rounded-md px-2 py-1 text-foreground-muted hover:bg-surface-strong hover:text-foreground sm:inline-flex">
            Open {recent.name}
          </Link>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          <Link href="/projects/new" className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 font-medium text-primary-foreground">
            <Plus className="h-3.5 w-3.5" /> Set up schema
          </Link>
          <button type="button" title="Toggle theme" aria-label="Toggle theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="rounded p-1.5 text-foreground-muted hover:bg-surface-strong hover:text-foreground">
            {theme === "dark" ? <SunMedium className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button type="button" title="AI team panel" aria-label="AI team panel" className="rounded p-1.5 text-foreground-muted hover:bg-surface-strong hover:text-foreground">
            <PanelRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="flex w-12 shrink-0 flex-col items-center gap-0.5 border-r border-border bg-surface py-2" aria-label="Workspace">
          {[
            { label: "Explorer", icon: Files, active: true },
            { label: "Search", icon: Search },
            { label: "Source control", icon: GitBranch },
          ].map((item) => (
            <button key={item.label} type="button" title={item.label} aria-label={item.label} className={cn("relative flex h-10 w-10 items-center justify-center rounded-md", item.active ? "text-foreground before:absolute before:-left-1 before:h-6 before:w-0.5 before:rounded before:bg-primary" : "text-foreground-muted hover:text-foreground")}>
              <item.icon className="h-5 w-5" />
            </button>
          ))}
          <div className="my-1 h-px w-6 bg-border" />
          <Link href="/projects/new" title="Working schema" aria-label="Working schema" className="flex h-10 w-10 items-center justify-center rounded-md text-foreground-muted hover:text-foreground">
            <Settings2 className="h-5 w-5" />
          </Link>
          <Link href={recent ? `/projects/${recent.id}/team` : "/projects/new"} title="AI Team" aria-label="AI Team" className="flex h-10 w-10 items-center justify-center rounded-md text-foreground-muted hover:text-foreground">
            <Users className="h-5 w-5" />
          </Link>
          <Link href={recent ? `/projects/${recent.id}/tasks` : "/projects/new"} title="Tasks" aria-label="Tasks" className="flex h-10 w-10 items-center justify-center rounded-md text-foreground-muted hover:text-foreground">
            <KanbanSquare className="h-5 w-5" />
          </Link>
          <Link href="/projects" title="Schemas" aria-label="Schemas" className="mt-auto flex h-10 w-10 items-center justify-center rounded-md text-foreground-muted hover:text-foreground">
            <FolderGit2 className="h-5 w-5" />
          </Link>
        </nav>

        <aside className="hidden w-[260px] shrink-0 border-r border-border bg-surface md:block">
          <EmptyPanel title="Explorer">
            <div className="space-y-1">
              <div className="flex items-center gap-2 rounded-md bg-surface-strong px-2 py-1.5 text-[12.5px] font-medium">
                <Code2 className="h-4 w-4 text-primary" />
                Workspace
              </div>
              {projectsQuery.isLoading ? <p className="px-2 py-2 text-xs text-foreground-muted">Loading schemas...</p> : null}
              {projects.length ? (
                <div className="pt-1">
                  {projects.slice(0, 8).map((project) => (
                    <Link key={project.id} href={`/projects/${project.id}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] text-foreground-muted hover:bg-surface-strong hover:text-foreground">
                      <FolderGit2 className="h-3.5 w-3.5" />
                      <span className="truncate">{project.name}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="px-2 py-2 text-xs leading-5 text-foreground-muted">No working schema has been set up yet.</p>
              )}
            </div>
          </EmptyPanel>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 bg-background">
            <div className="flex h-9 items-center border-b border-border bg-surface">
              <div className="flex h-full items-center border-r border-border bg-background px-3 text-xs font-medium">
                <Code2 className="mr-1.5 h-3.5 w-3.5 text-primary" />
                workspace.ts
              </div>
            </div>
            <div className="flex h-[calc(100%-2.25rem)] items-center justify-center p-6">
              <div className="w-full max-w-xl">
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-md border border-border bg-surface text-primary">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <h1 className="text-xl font-semibold tracking-tight">Workspace ready</h1>
                    <p className="mt-1 text-sm text-foreground-muted">Set up a working schema when you are ready to connect code, agents, tasks, and runtime commands.</p>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Link href="/projects/new" className="rounded-md border border-border bg-surface p-4 text-sm hover:border-primary/60">
                    <span className="font-medium text-foreground">Set up working schema</span>
                    <span className="mt-1 block text-xs leading-5 text-foreground-muted">Choose a folder, repository, team preset, model, and supervision level.</span>
                  </Link>
                  <Link href={recent ? `/projects/${recent.id}` : "/projects"} className="rounded-md border border-border bg-surface p-4 text-sm hover:border-primary/60">
                    <span className="font-medium text-foreground">{recent ? "Open recent workspace" : "Browse schemas"}</span>
                    <span className="mt-1 block text-xs leading-5 text-foreground-muted">{recent ? recent.name : "Review existing working schemas once they exist."}</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
          <div className="h-48 shrink-0 border-t border-border bg-surface">
            <div className="flex h-8 items-center gap-3 border-b border-border px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground-muted">
              <span className="text-foreground">Terminal</span>
              <span>Activity</span>
              <span>Preview</span>
            </div>
            <div className="p-3 font-mono text-xs text-foreground-muted">
              <p>$ workspace idle</p>
              <p className="mt-1">Open or create a working schema to attach files and run agents.</p>
            </div>
          </div>
        </main>

        <aside className="hidden w-[330px] shrink-0 border-l border-border bg-surface lg:block">
          <EmptyPanel title="Setup">
            <div className="space-y-3 text-sm">
              <p className="text-foreground-muted">Projects are now setup records for working schemas. The workspace itself stays available before and after you create one.</p>
              <Link href="/projects/new" className="flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
                <Plus className="h-4 w-4" />
                Set up schema
              </Link>
              {recent ? (
                <Link href={`/projects/${recent.id}`} className="flex items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-strong">
                  <Code2 className="h-4 w-4" />
                  Open {recent.name}
                </Link>
              ) : null}
            </div>
          </EmptyPanel>
        </aside>
      </div>

      <footer className="flex h-6 shrink-0 items-center gap-4 bg-surface-strong px-3 text-[11px] text-foreground-muted">
        <span>workspace</span>
        <span>{projects.length} schemas</span>
        <span className="ml-auto">idle</span>
      </footer>
    </div>
  );
}
