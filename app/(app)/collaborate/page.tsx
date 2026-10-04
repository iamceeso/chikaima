"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Undo2 } from "lucide-react";

import { IdeShell } from "@/components/collab/ide/ide-shell";
import { TeamEditor } from "@/components/collab/team-editor";
import { AdminAccessGate } from "@/components/settings/admin-access-gate";
import { Card } from "@/components/ui/card";
import { useAdminAccess } from "@/hooks/use-admin-access";
import { api } from "@/services/api";

/** Full-screen frame for the pages around the IDE: access checks and creating a team. */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-surface px-3">
        <Link href="/chat" className="flex items-center gap-2 text-foreground-muted hover:text-foreground" title="Back to Chikaima">
          <Undo2 className="h-4 w-4" />
          <Image src="/chikaima-logo.png" alt="Chikaima" width={20} height={20} className="h-5 w-5 object-contain" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em]">Chikaima</span>
        </Link>
        <span className="text-border">/</span>
        <span className="text-[13px] font-medium text-foreground">AI engineering team</span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-4xl">{children}</div>
      </div>
    </div>
  );
}

export default function CollaboratePage() {
  const { access, hasAdminAccess, workspaceAuthDisabled } = useAdminAccess();
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const teamsQuery = useQuery({ queryKey: ["collab-teams"], queryFn: () => api.getCollabTeams(access!), enabled: Boolean(access) });
  const modelsQuery = useQuery({ queryKey: ["collab-models"], queryFn: () => api.getWorkspaceModels(access!), enabled: Boolean(access) });
  const models = useMemo(() => (modelsQuery.data ?? []).filter((model) => model.is_available), [modelsQuery.data]);
  const teams = teamsQuery.data ?? [];
  const team = teams.find((candidate) => candidate.id === selectedTeamId) ?? teams[0] ?? null;

  if (!hasAdminAccess || !access) {
    return (
      <Frame>
        {workspaceAuthDisabled ? (
          <AdminAccessGate title="Administrator access required" description="AI teams edit files and run commands on this server, so only administrators can use them." />
        ) : (
          <Card className="p-6 text-sm text-foreground-muted">Only administrators can use AI teams, because they edit files and run commands on this server.</Card>
        )}
      </Frame>
    );
  }

  if (teamsQuery.isLoading) {
    return <Frame><p className="text-sm text-foreground-muted">Loading…</p></Frame>;
  }

  if (creating || !team) {
    return (
      <Frame>
        <h1 className="text-2xl font-semibold text-foreground">{team ? "New team" : "Build software with an AI engineering team"}</h1>
        <p className="mt-2 mb-5 text-sm text-foreground-muted">
          Pick a project folder and a template, give each agent a model, scope and permissions, and choose how much you want to approve. Agents plan, code, review and test
          each other&apos;s work; you supervise.
        </p>
        {models.length === 0 ? (
          <Card className="p-6 text-sm text-foreground-muted">Enable at least one model under Settings → Models before creating a team.</Card>
        ) : (
          <TeamEditor
            access={access}
            models={models}
            team={null}
            onDone={(saved) => {
              setCreating(false);
              if (saved) setSelectedTeamId(saved.id);
            }}
          />
        )}
      </Frame>
    );
  }

  return <IdeShell key={team.id} access={access} team={team} teams={teams} models={models} onSelectTeam={setSelectedTeamId} onNewTeam={() => setCreating(true)} />;
}
