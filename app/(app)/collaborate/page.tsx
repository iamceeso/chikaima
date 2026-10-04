"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Pencil, Play, Plus, Square, Trash2, Users } from "lucide-react";

import { ActivityFeed } from "@/components/collab/activity-feed";
import { ACTIVE_STATUSES, AUTONOMY_LABELS } from "@/components/collab/constants";
import { TeamEditor } from "@/components/collab/team-editor";
import { TeamRoster } from "@/components/collab/team-roster";
import { WorkspaceFiles } from "@/components/collab/workspace-files";
import { Topbar } from "@/components/layout/topbar";
import { AdminAccessGate } from "@/components/settings/admin-access-gate";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useAdminAccess } from "@/hooks/use-admin-access";
import { cn } from "@/lib/utils";
import { api, type ApiAccess } from "@/services/api";
import type { CollabMessage, CollabRunStatus, CollabTeam } from "@/types";

interface RunStreamState {
  runId: string | null;
  messages: CollabMessage[];
  status: CollabRunStatus | null;
  error: string | null;
}

/** Live transcript and status of one run. State is tagged with its run id, so switching runs never shows the previous run's messages. */
function useRunStream(access: ApiAccess, runId: string | null, onFinished: () => void): RunStreamState {
  const [state, setState] = useState<RunStreamState>({ runId: null, messages: [], status: null, error: null });
  // `access` is rebuilt every render; key the stream on the credential itself so it doesn't reconnect.
  const { token, authHeader } = access;

  useEffect(() => {
    if (!runId) return;
    const controller = new AbortController();
    const update = (patch: (current: RunStreamState) => Partial<RunStreamState>) =>
      setState((current) => {
        const base: RunStreamState = current.runId === runId ? current : { runId, messages: [], status: null, error: null };
        return { ...base, ...patch(base) };
      });
    api
      .streamCollabRun(
        { token, authHeader },
        runId,
        {
          onMessage: (message) => update((current) => ({ messages: current.messages.some((m) => m.id === message.id) ? current.messages : [...current.messages, message] })),
          onStatus: (status, error) => {
            update(() => ({ status, error }));
            if (!ACTIVE_STATUSES.includes(status)) onFinished();
          },
        },
        { after: 0, signal: controller.signal },
      )
      .catch(() => {
        // aborted on unmount or run switch
      });
    return () => controller.abort();
  }, [token, authHeader, runId, onFinished]);

  return state.runId === runId ? state : { runId, messages: [], status: null, error: null };
}

function TeamWorkspace({ access, team, onEdit }: { access: ApiAccess; team: CollabTeam; onEdit: () => void }) {
  const queryClient = useQueryClient();
  const [task, setTask] = useState("");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const runsQuery = useQuery({ queryKey: ["collab-runs", team.id], queryFn: () => api.getCollabRuns(access, team.id) });
  const runs = useMemo(() => runsQuery.data ?? [], [runsQuery.data]);
  const currentRunId = selectedRunId ?? runs[0]?.id ?? null;
  const onFinished = useMemo(() => () => void queryClient.invalidateQueries({ queryKey: ["collab-runs", team.id] }), [queryClient, team.id]);
  const { messages, status, error } = useRunStream(access, currentRunId, onFinished);
  const runActive = status !== null && ACTIVE_STATUSES.includes(status);
  const folderChanges = messages.filter((message) => message.kind === "action" || message.kind === "decision").length;
  const activeAgent = runActive ? [...messages].reverse().find((message) => typeof message.data.activity === "string") : undefined;

  const start = useMutation({
    mutationFn: () => api.startCollabRun(access, team.id, task),
    onSuccess: async (run) => {
      setTask("");
      setSelectedRunId(run.id);
      await queryClient.invalidateQueries({ queryKey: ["collab-runs", team.id] });
    },
  });
  const cancel = useMutation({ mutationFn: () => api.cancelCollabRun(access, currentRunId!) });
  const remove = useMutation({
    mutationFn: () => api.deleteCollabTeam(access, team.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["collab-teams"] }),
  });

  return (
    <div className="space-y-3">
      <Card className="rounded-[1.25rem] bg-surface px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-foreground">{team.name}</h2>
            <p className="text-xs text-foreground-muted">
              <code className="rounded bg-background px-1.5 py-0.5">{team.folder}</code> · {AUTONOMY_LABELS[team.autonomy]?.label ?? team.autonomy} · {team.decision_policy} review ·{" "}
              {team.max_model_calls} calls max
            </p>
          </div>
          <div className="flex min-w-0 items-center gap-2 text-xs">
            {runActive ? <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-primary" /> : null}
            {status ? (
              <span
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1 uppercase tracking-[0.14em]",
                  status === "awaiting_approval" ? "border-amber-500 text-amber-600" : "border-border text-foreground-muted",
                )}
              >
                {status.replace("_", " ")}
              </span>
            ) : null}
            {activeAgent ? <span className="truncate text-foreground-muted">{activeAgent.content}</span> : null}
          </div>
          <div className="ml-auto flex gap-2">
            {runActive && status !== "cancelling" ? (
              <Button type="button" variant="ghost" className="border border-border" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
                <Square className="mr-1 h-3.5 w-3.5" /> Stop run
              </Button>
            ) : null}
            <Button type="button" variant="ghost" className="border border-border" onClick={onEdit}>
              <Pencil className="mr-1 h-3.5 w-3.5" /> Edit team
            </Button>
            <Button
              type="button"
              variant="ghost"
              aria-label="Delete team"
              className="border border-border"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm(`Delete ${team.name} and its run history? Files in the folder are kept.`)) remove.mutate();
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
        {remove.error ? <p className="mt-2 text-xs text-destructive">{remove.error.message}</p> : null}
      </Card>

      <div className="grid gap-3 2xl:grid-cols-[1fr_17rem]">
        <WorkspaceFiles access={access} teamId={team.id} agentsWorking={runActive} refreshKey={folderChanges} />
        <TeamRoster team={team} messages={messages} runActive={runActive} />
      </div>

      <Card className="rounded-[1.25rem] bg-surface p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">Give the team a task</span>
            <Textarea
              className="mt-2 min-h-20"
              value={task}
              onChange={(event) => setTask(event.target.value)}
              placeholder="Build a subscription system with Stripe. Users should have Free, Pro and Team plans."
            />
          </div>
          <Button type="button" disabled={!task.trim() || start.isPending || runActive} onClick={() => start.mutate()}>
            <Play className="mr-1 h-4 w-4" /> {start.isPending ? "Starting…" : "Start"}
          </Button>
        </div>
        {start.error ? <p className="mt-2 text-sm text-destructive">{start.error.message}</p> : null}

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">Agent activity</span>
          {runs.slice(0, 8).map((run) => (
            <button
              key={run.id}
              type="button"
              onClick={() => setSelectedRunId(run.id)}
              className={cn(
                "max-w-56 truncate rounded-xl border px-2.5 py-1 text-left text-[11px]",
                run.id === currentRunId ? "border-primary bg-background text-foreground" : "border-border text-foreground-muted hover:text-foreground",
              )}
            >
              {run.task}
            </button>
          ))}
        </div>
        <div className="mt-4">
          {currentRunId ? (
            <ActivityFeed access={access} team={team} messages={messages} />
          ) : (
            <p className="text-sm text-foreground-muted">No runs yet. The lead will plan the task and delegate it, and every change is reviewed before it is kept.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

export default function CollaboratePage() {
  const { access, hasAdminAccess, workspaceAuthDisabled } = useAdminAccess();
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [editing, setEditing] = useState<CollabTeam | "new" | null>(null);

  const teamsQuery = useQuery({ queryKey: ["collab-teams"], queryFn: () => api.getCollabTeams(access!), enabled: Boolean(access) });
  const modelsQuery = useQuery({ queryKey: ["collab-models"], queryFn: () => api.getWorkspaceModels(access!), enabled: Boolean(access) });
  const models = useMemo(() => (modelsQuery.data ?? []).filter((model) => model.is_available), [modelsQuery.data]);
  const teams = teamsQuery.data ?? [];
  const selectedTeam = teams.find((team) => team.id === selectedTeamId) ?? teams[0] ?? null;

  return (
    <>
      <Topbar
        title="AI engineering team"
        description="Build software with a team of AI engineers you supervise. Agents plan, code, review and test each other's work; you set the roles and approve what matters."
      />

      {!hasAdminAccess || !access ? (
        workspaceAuthDisabled ? (
          <AdminAccessGate title="Administrator access required" description="AI teams edit files on this server, so only administrators can manage and run them." />
        ) : (
          <Card className="p-6 text-sm text-foreground-muted">Only administrators can manage AI teams, because they edit files on this server.</Card>
        )
      ) : (
        <div className="grid gap-3 xl:grid-cols-[13rem_1fr]">
          <Card className="h-fit rounded-[1.25rem] bg-surface p-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">Teams</span>
              <Button type="button" variant="ghost" aria-label="New team" onClick={() => setEditing("new")}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-1 space-y-1">
              {teams.map((team) => (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => {
                    setSelectedTeamId(team.id);
                    setEditing(null);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs",
                    selectedTeam?.id === team.id && !editing ? "bg-background text-foreground" : "text-foreground-muted hover:bg-background/70 hover:text-foreground",
                  )}
                >
                  <Users className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate font-medium">{team.name}</span>
                  <span className="ml-auto shrink-0">{team.members.length}</span>
                </button>
              ))}
              {teams.length === 0 && !teamsQuery.isLoading ? <p className="rounded-2xl border border-dashed border-border px-3 py-4 text-xs text-foreground-muted">No teams yet.</p> : null}
            </div>
          </Card>

          <div className="min-w-0">
            {editing ? (
              models.length === 0 ? (
                <Card className="p-6 text-sm text-foreground-muted">Enable at least one model under Settings → Models before creating a team.</Card>
              ) : (
                <TeamEditor
                  key={editing === "new" ? "new" : editing.id}
                  access={access}
                  models={models}
                  team={editing === "new" ? null : editing}
                  onDone={(saved) => {
                    setEditing(null);
                    if (saved) setSelectedTeamId(saved.id);
                  }}
                />
              )
            ) : selectedTeam ? (
              <TeamWorkspace key={selectedTeam.id} access={access} team={selectedTeam} onEdit={() => setEditing(selectedTeam)} />
            ) : (
              <Card className="rounded-[1.25rem] bg-surface p-6">
                <h2 className="text-lg font-semibold text-foreground">Create your first team</h2>
                <p className="mt-2 text-sm text-foreground-muted">
                  Pick a project folder, start from a template (Solo, SaaS or Laravel), give each agent a model, scope and permissions, and choose how much you want to approve.
                </p>
                <Button type="button" className="mt-4" onClick={() => setEditing("new")}>
                  <Plus className="mr-1 h-4 w-4" /> New team
                </Button>
              </Card>
            )}
          </div>
        </div>
      )}
    </>
  );
}
