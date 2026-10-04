"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, FileCode2, GitCommitHorizontal, GitCompareArrows, Settings2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { api, type ApiAccess } from "@/services/api";
import type { AIModel, CollabFileChange, CollabTeam } from "@/types";

import { CodeEditor, DiffView } from "../code-editor";
import { TeamEditor } from "../team-editor";

export type EditorTab =
  | { id: string; kind: "file"; path: string }
  | { id: string; kind: "diff"; title: string; files: CollabFileChange[] }
  | { id: string; kind: "commit"; hash: string; title: string }
  | { id: "settings"; kind: "settings" };

export function tabTitle(tab: EditorTab): string {
  switch (tab.kind) {
    case "file":
      return tab.path.split("/").at(-1)!;
    case "diff":
    case "commit":
      return tab.title;
    case "settings":
      return "Team settings";
  }
}

const TAB_ICON = { file: FileCode2, diff: GitCompareArrows, commit: GitCommitHorizontal, settings: Settings2 } as const;

function FileTab({
  access,
  teamId,
  path,
  draft,
  agentsWorking,
  onDraft,
  onSaved,
}: {
  access: ApiAccess;
  teamId: string;
  path: string;
  draft: string | undefined;
  agentsWorking: boolean;
  onDraft: (value: string) => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const fileQuery = useQuery({ queryKey: ["collab-file", teamId, path], queryFn: () => api.getCollabFile(access, teamId, path) });
  const save = useMutation({
    mutationFn: () => api.saveCollabFile(access, teamId, path, draft ?? ""),
    onSuccess: async () => {
      onSaved();
      await queryClient.invalidateQueries({ queryKey: ["collab-file", teamId, path] });
      await queryClient.invalidateQueries({ queryKey: ["collab-git", teamId] });
    },
  });

  if (fileQuery.error) return <p className="p-6 text-sm text-destructive">{fileQuery.error.message}</p>;
  if (!fileQuery.data) return <p className="p-6 text-xs text-foreground-muted">Loading…</p>;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-7 shrink-0 items-center gap-2 border-b border-border px-3 font-mono text-[11px] text-foreground-muted">
        <span className="truncate">{path.split("/").join(" › ")}</span>
        {agentsWorking ? <span className="ml-auto text-amber-600">Agents are working — saving is paused</span> : null}
        {save.error ? <span className="ml-auto text-destructive">{save.error.message}</span> : null}
      </div>
      <div className="min-h-0 flex-1">
        <CodeEditor
          path={path}
          value={draft ?? fileQuery.data.content}
          onChange={onDraft}
          onSave={() => {
            if (draft !== undefined && !agentsWorking) save.mutate();
          }}
        />
      </div>
    </div>
  );
}

function CommitTab({ access, teamId, hash }: { access: ApiAccess; teamId: string; hash: string }) {
  const filesQuery = useQuery({ queryKey: ["collab-commit", teamId, hash], queryFn: () => api.getCollabCommitFiles(access, teamId, hash) });
  if (!filesQuery.data) return <p className="p-6 text-xs text-foreground-muted">{filesQuery.error?.message ?? "Loading…"}</p>;
  return <FillDiff files={filesQuery.data} />;
}

/** A diff that fills the editor area. */
function FillDiff({ files }: { files: CollabFileChange[] }) {
  return (
    <div className="h-full p-2">
      <DiffView files={files} height="fill" />
    </div>
  );
}

function Welcome({ team }: { team: CollabTeam }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md text-center">
        <Bot className="mx-auto h-10 w-10 text-primary" />
        <h2 className="mt-4 text-lg font-semibold text-foreground">{team.name}</h2>
        <p className="mt-2 text-sm text-foreground-muted">
          Describe a task in the team panel. The lead plans it, agents write the code, reviewers and testers check it, and you approve what matters. Open files from the
          Explorer to read or edit them yourself.
        </p>
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-1.5 text-left text-xs text-foreground-muted">
          <dt>Save file</dt>
          <dd className="font-mono text-foreground">⌘/Ctrl + S</dd>
          <dt>Run a command</dt>
          <dd className="text-foreground">Terminal tab, below</dd>
          <dt>See the app</dt>
          <dd className="text-foreground">Preview tab, below</dd>
          <dt>Review history</dt>
          <dd className="text-foreground">Source Control, left</dd>
        </dl>
      </div>
    </div>
  );
}

/** Editor tabs: files (Monaco), change and commit diffs, and team settings. */
export function EditorArea({
  access,
  team,
  models,
  tabs,
  activeId,
  drafts,
  agentsWorking,
  refreshKey,
  onActivate,
  onClose,
  onDraft,
  onTeamSaved,
}: {
  access: ApiAccess;
  team: CollabTeam;
  models: AIModel[];
  tabs: EditorTab[];
  activeId: string | null;
  drafts: Record<string, string>;
  agentsWorking: boolean;
  refreshKey: number;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onDraft: (path: string, value: string | undefined) => void;
  onTeamSaved: () => void;
}) {
  const queryClient = useQueryClient();

  // Agents edit files during a run: reload open files the user hasn't changed.
  useEffect(() => {
    if (refreshKey === 0) return;
    void queryClient.invalidateQueries({
      queryKey: ["collab-file", team.id],
      predicate: (query) => drafts[String(query.queryKey[2])] === undefined,
    });
  }, [refreshKey, queryClient, team.id, drafts]);

  const active = tabs.find((tab) => tab.id === activeId) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {tabs.length > 0 ? (
        <div className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-border bg-surface" role="tablist">
          {tabs.map((tab) => {
            const Icon = TAB_ICON[tab.kind];
            const dirty = tab.kind === "file" && drafts[tab.path] !== undefined;
            return (
              <div
                key={tab.id}
                role="tab"
                aria-selected={tab.id === activeId}
                className={cn(
                  "group flex shrink-0 items-center gap-1.5 border-r border-border pl-3 pr-1.5 text-[12.5px]",
                  tab.id === activeId ? "border-t-2 border-t-primary bg-background text-foreground" : "border-t-2 border-t-transparent text-foreground-muted hover:text-foreground",
                )}
              >
                <button type="button" onClick={() => onActivate(tab.id)} onAuxClick={() => onClose(tab.id)} className="flex items-center gap-1.5" title={tab.kind === "file" ? tab.path : tabTitle(tab)}>
                  <Icon className="h-3.5 w-3.5 opacity-70" />
                  <span className="max-w-48 truncate">{tabTitle(tab)}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Close ${tabTitle(tab)}`}
                  onClick={() => onClose(tab.id)}
                  className="flex h-5 w-5 items-center justify-center rounded hover:bg-surface-strong"
                >
                  {dirty ? <span className="h-2 w-2 rounded-full bg-foreground group-hover:hidden" /> : null}
                  <X className={cn("h-3.5 w-3.5", dirty && "hidden group-hover:block", !dirty && tab.id !== activeId && "opacity-0 group-hover:opacity-100")} />
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        {!active ? <Welcome team={team} /> : null}
        {active?.kind === "file" ? (
          <FileTab
            key={active.path}
            access={access}
            teamId={team.id}
            path={active.path}
            draft={drafts[active.path]}
            agentsWorking={agentsWorking}
            onDraft={(value) => onDraft(active.path, value)}
            onSaved={() => onDraft(active.path, undefined)}
          />
        ) : null}
        {active?.kind === "diff" ? <FillDiff files={active.files} /> : null}
        {active?.kind === "commit" ? <CommitTab access={access} teamId={team.id} hash={active.hash} /> : null}
        {active?.kind === "settings" ? (
          <div className="h-full overflow-y-auto p-4">
            {models.length === 0 ? (
              <p className="text-sm text-foreground-muted">Enable at least one model under Settings → Models first.</p>
            ) : (
              <TeamEditor access={access} models={models} team={team} onDone={() => onTeamSaved()} />
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
