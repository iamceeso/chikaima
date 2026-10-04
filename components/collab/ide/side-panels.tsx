"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleDashed, GitMerge, LoaderCircle, RefreshCw, ShieldAlert, Undo2, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { api, type ApiAccess } from "@/services/api";
import type { CollabRun, CollabTeam } from "@/types";

import { ACTIVE_STATUSES } from "../constants";

function PanelHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex h-9 shrink-0 items-center justify-between px-3">
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground-muted">{title}</span>
      <div className="flex items-center gap-0.5">{children}</div>
    </div>
  );
}

const iconButton = "rounded p-1 text-foreground-muted hover:bg-surface-strong hover:text-foreground disabled:opacity-40";

const STATUS_COLOR: Record<string, string> = { M: "text-amber-600", A: "text-emerald-600", D: "text-red-600", "?": "text-emerald-600", R: "text-sky-600" };

/** Git for the team folder, VS Code style: changes to commit, branches, run branches to merge, and history. */
export function SourceControl({
  access,
  team,
  disabled,
  onOpenFile,
  onOpenCommit,
}: {
  access: ApiAccess;
  team: CollabTeam;
  disabled: boolean;
  onOpenFile: (path: string) => void;
  onOpenCommit: (hash: string, title: string) => void;
}) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const gitQuery = useQuery({ queryKey: ["collab-git", team.id], queryFn: () => api.getCollabGit(access, team.id) });
  const action = useMutation({
    mutationFn: (payload: Parameters<typeof api.collabGitAction>[2]) => api.collabGitAction(access, team.id, payload),
    onSuccess: async () => {
      setMessage("");
      await queryClient.invalidateQueries({ queryKey: ["collab-git", team.id] });
      await queryClient.invalidateQueries({ queryKey: ["collab-files", team.id] });
      await queryClient.invalidateQueries({ queryKey: ["collab-file", team.id] });
    },
  });
  const git = gitQuery.data;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader title="Source control">
        <button type="button" aria-label="Refresh" className={iconButton} onClick={() => void gitQuery.refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </PanelHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 text-xs">
        {action.error ? <p className="mb-2 text-destructive">{action.error.message}</p> : null}
        {disabled ? <p className="mb-2 text-amber-600">Agents are working; git actions are paused.</p> : null}
        {git && !git.is_repo ? (
          <div className="space-y-2 text-foreground-muted">
            <p>This folder isn&apos;t a git repository{team.git_enabled ? " yet — the team's first run will create one" : ""}.</p>
            <button
              type="button"
              disabled={disabled || action.isPending}
              onClick={() => action.mutate({ action: "init" })}
              className="w-full rounded-md bg-primary py-1.5 text-primary-foreground disabled:opacity-50"
            >
              Initialize repository
            </button>
          </div>
        ) : null}

        {git?.is_repo ? (
          <>
            <select
              aria-label="Branch"
              className="mb-2 h-7 w-full rounded-md border border-border bg-background px-2 text-xs"
              value={git.branch ?? ""}
              disabled={disabled || action.isPending}
              onChange={(event) => action.mutate({ action: "checkout", branch: event.target.value })}
            >
              {git.branches.map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </select>

            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={`Message (commit on "${git.branch ?? ""}")`}
              className="h-14 w-full resize-none rounded-md border border-border bg-background p-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <div className="mt-1.5 flex gap-1.5">
              <button
                type="button"
                disabled={disabled || !message.trim() || !git.changes.length || action.isPending}
                onClick={() => action.mutate({ action: "commit", message })}
                className="flex-1 rounded-md bg-primary py-1.5 text-primary-foreground disabled:opacity-50"
              >
                Commit
              </button>
              <button
                type="button"
                aria-label="Discard all changes"
                title="Discard all changes"
                disabled={disabled || !git.changes.length || action.isPending}
                onClick={() => window.confirm("Discard all uncommitted changes? This cannot be undone.") && action.mutate({ action: "discard" })}
                className="rounded-md border border-border px-2 disabled:opacity-50"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <p className="mt-4 mb-1 font-semibold uppercase tracking-[0.1em] text-foreground-muted">
              Changes {git.changes.length ? `(${git.changes.length})` : ""}
            </p>
            {git.changes.map((change) => {
              const code = change.code.trim()[0] ?? "M";
              return (
                <button
                  key={change.path}
                  type="button"
                  onClick={() => onOpenFile(change.path)}
                  className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-surface-strong/60"
                >
                  <span className="truncate text-foreground">{change.path}</span>
                  <span className={cn("ml-auto font-mono font-semibold", STATUS_COLOR[code] ?? "text-foreground-muted")}>{code === "?" ? "U" : code}</span>
                </button>
              );
            })}

            {git.branches.some((branch) => branch.startsWith("chikaima/") && branch !== git.branch) ? (
              <>
                <p className="mt-4 mb-1 font-semibold uppercase tracking-[0.1em] text-foreground-muted">Unmerged runs</p>
                {git.branches
                  .filter((branch) => branch.startsWith("chikaima/") && branch !== git.branch)
                  .map((branch) => (
                    <div key={branch} className="flex items-center gap-1 py-0.5">
                      <span className="truncate font-mono">{branch.replace("chikaima/", "")}</span>
                      <button
                        type="button"
                        title={`Merge into ${git.branch}`}
                        disabled={disabled || action.isPending}
                        onClick={() => window.confirm(`Merge ${branch} into ${git.branch}?`) && action.mutate({ action: "merge", branch })}
                        className={cn(iconButton, "ml-auto")}
                      >
                        <GitMerge className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
              </>
            ) : null}

            <p className="mt-4 mb-1 font-semibold uppercase tracking-[0.1em] text-foreground-muted">History</p>
            {git.commits.map((commit) => (
              <button
                key={commit.hash}
                type="button"
                onClick={() => onOpenCommit(commit.hash, `${commit.shortHash} ${commit.subject}`)}
                className="block w-full rounded px-1 py-1 text-left hover:bg-surface-strong/60"
                title={`${commit.author} · ${new Date(commit.date).toLocaleString()}`}
              >
                <span className="block truncate text-foreground">{commit.subject}</span>
                <span className="block truncate text-[11px] text-muted">
                  <span className="font-mono">{commit.shortHash}</span> · {commit.author}
                </span>
              </button>
            ))}
          </>
        ) : null}
      </div>
    </div>
  );
}

const RUN_ICON: Record<string, React.ReactNode> = {
  completed: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />,
  failed: <XCircle className="h-3.5 w-3.5 text-red-600" />,
  cancelled: <CircleDashed className="h-3.5 w-3.5 text-foreground-muted" />,
  awaiting_approval: <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />,
};

/** Every task the team has been given, newest first. */
export function RunsPanel({ runs, selectedId, onSelect }: { runs: CollabRun[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader title="Runs" />
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {runs.length === 0 ? <p className="px-3 text-xs text-foreground-muted">No runs yet. Give the team a task in the panel on the right.</p> : null}
        {runs.map((run) => (
          <button
            key={run.id}
            type="button"
            onClick={() => onSelect(run.id)}
            className={cn("flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-surface-strong/60", run.id === selectedId && "bg-primary/12")}
          >
            <span className="mt-0.5 shrink-0">
              {RUN_ICON[run.status] ?? (ACTIVE_STATUSES.includes(run.status) ? <LoaderCircle className="h-3.5 w-3.5 animate-spin text-primary" /> : null)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs text-foreground">{run.task}</span>
              <span className="block text-[11px] text-muted">
                {run.status.replace("_", " ")} · {new Date(run.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Text search across the project's files; results open at the matching line. */
export function SearchPanel({ access, team, onOpen }: { access: ApiAccess; team: CollabTeam; onOpen: (path: string, line: number) => void }) {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const results = useQuery({
    queryKey: ["collab-search", team.id, submitted],
    queryFn: () => api.searchProject(access, team.id, submitted),
    enabled: submitted.length >= 2,
  });
  const grouped = new Map<string, Array<{ line: number; text: string }>>();
  for (const match of results.data?.matches ?? []) {
    const list = grouped.get(match.path) ?? [];
    list.push(match);
    grouped.set(match.path, list);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader title="Search" />
      <form
        className="px-3 pb-2"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(query.trim());
        }}
      >
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search files… (Enter)"
          className="h-7 w-full rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </form>
      <div className="min-h-0 flex-1 overflow-y-auto pb-4 text-xs">
        {results.isFetching ? <p className="px-3 text-foreground-muted">Searching…</p> : null}
        {results.error ? <p className="px-3 text-destructive">{results.error.message}</p> : null}
        {results.data && !results.data.matches.length ? <p className="px-3 text-foreground-muted">No results.</p> : null}
        {results.data?.matches.length ? (
          <p className="px-3 pb-1 text-muted">
            {results.data.matches.length}
            {results.data.truncated ? "+" : ""} results in {grouped.size} files
          </p>
        ) : null}
        {[...grouped.entries()].map(([path, matches]) => (
          <div key={path} className="mb-1">
            <p className="truncate px-3 py-0.5 font-medium text-foreground">{path}</p>
            {matches.map((match) => (
              <button
                key={match.line}
                type="button"
                onClick={() => onOpen(path, match.line)}
                className="flex w-full gap-2 px-3 py-0.5 pl-5 text-left hover:bg-surface-strong/60"
              >
                <span className="shrink-0 font-mono text-muted">{match.line}</span>
                <span className="truncate font-mono text-foreground-muted">{match.text}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
