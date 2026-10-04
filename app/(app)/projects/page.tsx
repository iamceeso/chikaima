"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Bot, Download, FolderGit2, GitBranch, Plus, ShieldAlert } from "lucide-react";

import { AdminAccessGate } from "@/components/settings/admin-access-gate";
import { Button } from "@/components/ui/button";
import { useAdminAccess } from "@/hooks/use-admin-access";
import { useLastProject } from "@/lib/last-project";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";
import type { CollabProject } from "@/types";

function repoLabel(remote: string | null): string | null {
  if (!remote) return null;
  const match = /[:/]([^/:]+\/[^/]+?)(\.git)?$/.exec(remote);
  return match ? match[1]! : remote;
}

function ProjectCard({ project }: { project: CollabProject }) {
  const waiting = project.active_run?.status === "awaiting_approval";
  return (
    <Link href={`/projects/${project.id}`} className="group flex flex-col rounded-lg border border-border bg-surface p-4 transition-colors hover:border-primary/60">
      <div className="flex items-start gap-2">
        <FolderGit2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground group-hover:text-primary">{project.name}</p>
          <p className="truncate font-mono text-[11.5px] text-muted">{repoLabel(project.remote) ?? project.folder}</p>
        </div>
        {project.active_run ? (
          <span className={cn("flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium", waiting ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400")}>
            {waiting ? <ShieldAlert className="h-3 w-3" /> : <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />}
            {waiting ? "Needs approval" : "Agents working"}
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-[12.5px] text-foreground-muted">{project.stack.length ? project.stack.join(" · ") : "No stack detected yet"}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-foreground-muted">
        {project.branch ? (
          <span className="flex items-center gap-1 font-mono">
            <GitBranch className="h-3 w-3" />
            {project.branch}
          </span>
        ) : null}
        <span className="flex items-center gap-1">
          <Bot className="h-3 w-3" />
          {project.members.length} AI agents
        </span>
        {project.open_tasks ? <span>{project.open_tasks} open tasks</span> : null}
        <span className="flex items-center gap-1">
          <span className={cn("h-1.5 w-1.5 rounded-full", project.runtime === "running" ? "bg-emerald-500" : "bg-border")} />
          {project.runtime === "running" ? "Runtime running" : "Runtime stopped"}
        </span>
      </div>
      <p className="mt-3 border-t border-border pt-2 text-[11px] text-muted">Last activity {timeAgo(project.last_activity)}</p>
    </Link>
  );
}

export default function ProjectsPage() {
  const { access, hasAdminAccess, workspaceAuthDisabled } = useAdminAccess();
  const lastProject = useLastProject();
  const projectsQuery = useQuery({ queryKey: ["collab-projects"], queryFn: () => api.getProjects(access!), enabled: Boolean(access), refetchInterval: 15_000 });
  const projects = projectsQuery.data ?? [];
  const recent = projects.find((project) => project.id === lastProject) ?? projects[0];

  if (!hasAdminAccess || !access) {
    return workspaceAuthDisabled ? (
      <AdminAccessGate title="Administrator access required" description="Projects run code and AI agents on this server, so only administrators can open them." />
    ) : (
      <p className="p-6 text-sm text-foreground-muted">Only administrators can open projects, because they run code and AI agents on this server.</p>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <section className="border-b border-border pb-8 pt-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Set up working schemas</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground-muted">
          Projects define the folder, repository, AI team, model access, and commands that power a workspace.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild href="/projects/new">
            <Plus className="mr-1.5 h-4 w-4" /> New project
          </Button>
          <Button asChild href="/projects/new?source=import" variant="outline">
            <Download className="mr-1.5 h-4 w-4" /> Import repository
          </Button>
          {recent ? (
            <Button asChild href={`/projects/${recent.id}`} variant="ghost">
              Open workspace: {recent.name}
            </Button>
          ) : null}
        </div>
      </section>

      <section className="py-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground-muted">Working schemas</h2>
          {projects.length ? <span className="text-xs text-muted">{projects.length}</span> : null}
        </div>
        {projectsQuery.isLoading ? <p className="text-sm text-foreground-muted">Loading projects…</p> : null}
        {projectsQuery.error ? <p className="text-sm text-destructive">{projectsQuery.error.message}</p> : null}
        {!projectsQuery.isLoading && projects.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center">
            <p className="text-sm font-medium text-foreground">No working schemas yet</p>
            <p className="mt-1 text-sm text-foreground-muted">The workspace is still available. Set up a schema when you are ready to attach code and agents.</p>
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      </section>
    </div>
  );
}
