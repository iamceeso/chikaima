"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { IdeShell, type WorkspaceView } from "@/components/collab/ide/ide-shell";
import { AdminAccessGate } from "@/components/settings/admin-access-gate";
import { useAdminAccess } from "@/hooks/use-admin-access";
import { setLastProject } from "@/lib/last-project";
import { api } from "@/services/api";

function viewFor(pathname: string, projectId: string): WorkspaceView {
  const rest = pathname.slice(`/projects/${projectId}`.length);
  if (rest.startsWith("/tasks")) return "tasks";
  if (rest.startsWith("/team")) return "team";
  if (rest.startsWith("/settings")) return "settings";
  return "code";
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-screen items-center justify-center bg-background p-6 text-sm text-foreground-muted">{children}</div>;
}

/**
 * Hosts the project's workspace. The workspace lives in this layout (the
 * child pages render nothing), so moving between the editor, tasks, AI team
 * and settings keeps open files, the live run and panels intact.
 */
export default function ProjectLayout() {
  const { projectId } = useParams<{ projectId: string }>();
  const pathname = usePathname();
  const { access, hasAdminAccess, workspaceAuthDisabled } = useAdminAccess();
  const teamsQuery = useQuery({ queryKey: ["collab-teams"], queryFn: () => api.getCollabTeams(access!), enabled: Boolean(access) });
  const modelsQuery = useQuery({ queryKey: ["collab-models"], queryFn: () => api.getWorkspaceModels(access!), enabled: Boolean(access) });
  const models = useMemo(() => (modelsQuery.data ?? []).filter((model) => model.is_available), [modelsQuery.data]);
  const project = teamsQuery.data?.find((team) => team.id === projectId);

  useEffect(() => {
    if (project) setLastProject(project.id);
  }, [project]);

  if (!hasAdminAccess || !access) {
    return workspaceAuthDisabled ? (
      <div className="mx-auto max-w-md pt-16">
        <AdminAccessGate title="Administrator access required" description="Projects run code and AI agents on this server, so only administrators can open them." />
      </div>
    ) : (
      <Centered>Only administrators can open projects, because they run code and AI agents on this server.</Centered>
    );
  }
  if (teamsQuery.isLoading) return <Centered>Opening workspace…</Centered>;
  if (!project) {
    return (
      <Centered>
        <span>
          This project doesn&apos;t exist or you don&apos;t have access to it.{" "}
          <Link href="/projects" className="text-primary underline">
            All projects
          </Link>
        </span>
      </Centered>
    );
  }
  return <IdeShell access={access} team={project} projects={teamsQuery.data ?? []} models={models} view={viewFor(pathname, projectId)} />;
}
