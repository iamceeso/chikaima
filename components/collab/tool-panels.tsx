"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, GitBranch, GitCommitHorizontal, GitMerge, Play, RefreshCw, Rocket, Square, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { api, type ApiAccess } from "@/services/api";
import type { CollabTeam } from "@/types";

import { DiffView } from "./code-editor";

function Console({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [text]);
  return (
    <pre ref={ref} className={cn("max-h-80 min-h-40 overflow-auto rounded-xl bg-zinc-950 p-3 font-mono text-[11.5px] leading-relaxed text-zinc-100", className)}>
      {text || " "}
    </pre>
  );
}

/** Runs one command at a time in the team folder (inside the project container under Docker) and streams the output. */
export function TerminalPanel({ access, team, disabled }: { access: ApiAccess; team: CollabTeam; disabled: boolean }) {
  const [command, setCommand] = useState("");
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState<AbortController | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);

  const run = async () => {
    const text = command.trim();
    if (!text || running) return;
    const controller = new AbortController();
    setRunning(controller);
    setHistory((current) => [...current.filter((entry) => entry !== text), text]);
    setCursor(null);
    setCommand("");
    setOutput((current) => `${current}${current ? "\n" : ""}$ ${text}\n`);
    try {
      await api.streamCollabCommand(access, team.id, "terminal", (chunk) => setOutput((current) => current + chunk), { command: text, signal: controller.signal });
    } catch (error) {
      if (!controller.signal.aborted) setOutput((current) => `${current}[error] ${error instanceof Error ? error.message : String(error)}\n`);
      else setOutput((current) => `${current}\n[stopped]\n`);
    } finally {
      setRunning(null);
    }
  };

  return (
    <div>
      <Console text={output} />
      <form
        className="mt-2 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void run();
        }}
      >
        <span className="self-center font-mono text-xs text-foreground-muted">{team.folder} $</span>
        <Input
          className="h-9 flex-1 font-mono text-xs"
          value={command}
          disabled={disabled}
          onChange={(event) => setCommand(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp" && history.length) {
              event.preventDefault();
              const next = cursor === null ? history.length - 1 : Math.max(0, cursor - 1);
              setCursor(next);
              setCommand(history[next]!);
            } else if (event.key === "ArrowDown" && cursor !== null) {
              event.preventDefault();
              const next = cursor + 1;
              setCursor(next >= history.length ? null : next);
              setCommand(next >= history.length ? "" : history[next]!);
            }
          }}
          placeholder={disabled ? "Agents are working in this folder" : "npm install, npm test, ls…"}
        />
        {running ? (
          <Button type="button" variant="ghost" className="h-9 border border-border" onClick={() => running.abort()}>
            <Square className="mr-1 h-3.5 w-3.5" /> Stop
          </Button>
        ) : (
          <Button type="submit" className="h-9" disabled={!command.trim() || disabled}>
            Run
          </Button>
        )}
        <Button type="button" variant="ghost" className="h-9 border border-border" onClick={() => setOutput("")}>
          Clear
        </Button>
      </form>
      <p className="mt-1.5 text-[11px] text-muted">Each command runs from the project folder. Interactive programs (prompts, editors) aren&apos;t supported.</p>
    </div>
  );
}

/** The team's dev server, embedded, with its logs and start/stop controls. */
export function PreviewPanel({ access, team }: { access: ApiAccess; team: CollabTeam }) {
  const queryClient = useQueryClient();
  const [path, setPath] = useState("/");
  const [frameKey, setFrameKey] = useState(0);
  const [showLogs, setShowLogs] = useState(false);
  const previewQuery = useQuery({
    queryKey: ["collab-preview", team.id],
    queryFn: () => api.getCollabPreview(access, team.id),
    refetchInterval: (query) => (query.state.data && ["starting", "running"].includes(query.state.data.status) ? 2_000 : false),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["collab-preview", team.id] });
  const start = useMutation({ mutationFn: () => api.startCollabPreview(access, team.id), onSuccess: refresh });
  const stop = useMutation({ mutationFn: () => api.stopCollabPreview(access, team.id), onSuccess: refresh });

  const preview = previewQuery.data;
  const url = preview?.port && typeof window !== "undefined" ? `${window.location.protocol}//${window.location.hostname}:${preview.port}${path.startsWith("/") ? path : `/${path}`}` : null;

  if (preview && !preview.configured) {
    return <p className="text-sm text-foreground-muted">Add a preview command in the team settings (for example <code>npm run dev -- --port $PORT --hostname 0.0.0.0</code>) to see the app live here.</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("rounded-full border px-2.5 py-0.5 text-[11px] uppercase tracking-[0.14em]", preview?.status === "running" ? "border-emerald-500 text-emerald-600" : "border-border text-foreground-muted")}>
          {preview?.status ?? "…"}
        </span>
        {preview?.status === "exited" ? <span className="text-xs text-destructive">exited with code {preview.exitCode}</span> : null}
        <Input className="h-8 w-48 font-mono text-xs" value={path} onChange={(event) => setPath(event.target.value)} aria-label="Preview path" />
        <Button type="button" variant="ghost" className="h-8 border border-border px-2.5 text-xs" onClick={() => setFrameKey((value) => value + 1)} disabled={!url}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary">
            Open <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
        <div className="ml-auto flex gap-2">
          <Button type="button" className="h-8 px-3 text-xs" disabled={start.isPending} onClick={() => start.mutate()}>
            <Play className="mr-1 h-3.5 w-3.5" /> {preview?.status === "running" || preview?.status === "starting" ? "Restart" : "Start"}
          </Button>
          {preview?.status === "running" || preview?.status === "starting" ? (
            <Button type="button" variant="ghost" className="h-8 border border-border px-3 text-xs" onClick={() => stop.mutate()}>
              <Square className="mr-1 h-3.5 w-3.5" /> Stop
            </Button>
          ) : null}
          <Button type="button" variant="ghost" className="h-8 border border-border px-3 text-xs" onClick={() => setShowLogs((value) => !value)}>
            Logs
          </Button>
        </div>
      </div>
      {start.error ?? stop.error ? <p className="mt-2 text-xs text-destructive">{(start.error ?? stop.error)!.message}</p> : null}
      {showLogs ? <Console className="mt-2" text={preview?.logs ?? ""} /> : null}
      {url && preview?.status === "running" ? (
        <iframe key={frameKey} src={url} title="Live preview" className="mt-3 h-[34rem] w-full rounded-xl border border-border bg-white" />
      ) : (
        <div className="mt-3 flex h-48 items-center justify-center rounded-xl border border-dashed border-border text-sm text-foreground-muted">
          {preview?.status === "starting" ? "Starting the dev server…" : "Start the preview to see the app. Agents with “Use the preview” can browse and screenshot it."}
        </div>
      )}
    </div>
  );
}

/** Branches, uncommitted changes, history with side-by-side diffs, and merging run branches. */
export function GitPanel({ access, team, disabled }: { access: ApiAccess; team: CollabTeam; disabled: boolean }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [openCommit, setOpenCommit] = useState<string | null>(null);
  const gitQuery = useQuery({ queryKey: ["collab-git", team.id], queryFn: () => api.getCollabGit(access, team.id) });
  const commitFiles = useQuery({ queryKey: ["collab-commit", team.id, openCommit], queryFn: () => api.getCollabCommitFiles(access, team.id, openCommit!), enabled: Boolean(openCommit) });
  const action = useMutation({
    mutationFn: (payload: Parameters<typeof api.collabGitAction>[2]) => api.collabGitAction(access, team.id, payload),
    onSuccess: async () => {
      setMessage("");
      await queryClient.invalidateQueries({ queryKey: ["collab-git", team.id] });
      await queryClient.invalidateQueries({ queryKey: ["collab-files", team.id] });
    },
  });

  const git = gitQuery.data;
  if (git && !git.is_repo) {
    return (
      <div className="text-sm text-foreground-muted">
        This folder isn&apos;t a git repository yet. {team.git_enabled ? "The team's first run will create one, or " : ""}
        <Button type="button" variant="ghost" className="ml-1 h-8 border border-border px-3 text-xs" disabled={disabled || action.isPending} onClick={() => action.mutate({ action: "init" })}>
          Initialize git
        </Button>
      </div>
    );
  }

  const runBranches = (git?.branches ?? []).filter((branch) => branch.startsWith("chikaima/") && branch !== git?.branch);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <GitBranch className="h-4 w-4 text-foreground-muted" />
        <select
          className="h-8 rounded-md border border-border bg-background px-2 text-xs"
          value={git?.branch ?? ""}
          disabled={disabled || action.isPending}
          onChange={(event) => action.mutate({ action: "checkout", branch: event.target.value })}
        >
          {(git?.branches ?? []).map((branch) => (
            <option key={branch} value={branch}>
              {branch}
            </option>
          ))}
        </select>
        <Button type="button" variant="ghost" className="h-8 border border-border px-2.5" onClick={() => void gitQuery.refetch()} aria-label="Refresh">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
        {disabled ? <span className="text-xs text-foreground-muted">Agents are working; git actions are paused.</span> : null}
      </div>
      {action.error ? <p className="text-xs text-destructive">{action.error.message}</p> : null}

      {runBranches.length > 0 ? (
        <div className="rounded-xl border border-border bg-background p-3">
          <p className="text-xs font-semibold text-foreground">Unmerged run branches</p>
          {runBranches.map((branch) => (
            <div key={branch} className="mt-1.5 flex items-center gap-2 text-xs">
              <span className="font-mono">{branch}</span>
              <Button
                type="button"
                variant="ghost"
                className="ml-auto h-7 border border-border px-2 text-xs"
                disabled={disabled || action.isPending}
                onClick={() => window.confirm(`Merge ${branch} into ${git?.branch}?`) && action.mutate({ action: "merge", branch })}
              >
                <GitMerge className="mr-1 h-3.5 w-3.5" /> Merge into {git?.branch}
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-background p-3">
        <p className="text-xs font-semibold text-foreground">Uncommitted changes ({git?.changes.length ?? 0})</p>
        <ul className="mt-1.5 max-h-40 space-y-0.5 overflow-y-auto font-mono text-[11px] text-foreground-muted">
          {git?.changes.map((change) => (
            <li key={change.path}>
              <span className="inline-block w-6 text-primary">{change.code.trim() || "·"}</span>
              {change.path}
            </li>
          ))}
        </ul>
        {git?.changes.length ? (
          <div className="mt-2 flex gap-2">
            <Input className="h-8 flex-1 text-xs" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Commit message" />
            <Button type="button" className="h-8 px-3 text-xs" disabled={disabled || !message.trim() || action.isPending} onClick={() => action.mutate({ action: "commit", message })}>
              <GitCommitHorizontal className="mr-1 h-3.5 w-3.5" /> Commit
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-8 border border-border px-3 text-xs"
              disabled={disabled || action.isPending}
              onClick={() => window.confirm("Discard all uncommitted changes? This cannot be undone.") && action.mutate({ action: "discard" })}
            >
              <Undo2 className="mr-1 h-3.5 w-3.5" /> Discard
            </Button>
          </div>
        ) : null}
      </div>

      <div>
        <p className="text-xs font-semibold text-foreground">History</p>
        <ol className="mt-1.5 space-y-1">
          {git?.commits.map((commit) => (
            <li key={commit.hash}>
              <button
                type="button"
                onClick={() => setOpenCommit(openCommit === commit.hash ? null : commit.hash)}
                className={cn("grid w-full grid-cols-[4.5rem_1fr_auto] gap-2 rounded-lg px-2 py-1 text-left text-xs hover:bg-background", openCommit === commit.hash && "bg-background")}
              >
                <span className="font-mono text-primary">{commit.shortHash}</span>
                <span className="truncate text-foreground">{commit.subject}</span>
                <span className="text-muted">
                  {commit.author} · {new Date(commit.date).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                </span>
              </button>
              {openCommit === commit.hash ? <div className="mt-2">{commitFiles.data ? <DiffView files={commitFiles.data} /> : <p className="text-xs text-foreground-muted">Loading…</p>}</div> : null}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** Ships the project with the team's deploy command. Pressing Deploy is the supervisor's approval. */
export function DeployPanel({ access, team, disabled }: { access: ApiAccess; team: CollabTeam; disabled: boolean }) {
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState<AbortController | null>(null);

  if (!team.deploy_command) {
    return <p className="text-sm text-foreground-muted">Add a deploy command in the team settings (for example <code>vercel deploy --prod</code> or <code>fly deploy</code>). Deploys always need you: agents can only ask.</p>;
  }

  const deploy = async () => {
    if (!window.confirm(`Deploy now?\n\n${team.deploy_command}`)) return;
    const controller = new AbortController();
    setRunning(controller);
    setOutput("");
    try {
      await api.streamCollabCommand(access, team.id, "deploy", (chunk) => setOutput((current) => current + chunk), { signal: controller.signal });
    } catch (error) {
      setOutput((current) => `${current}${controller.signal.aborted ? "\n[stopped]" : `[error] ${error instanceof Error ? error.message : String(error)}`}\n`);
    } finally {
      setRunning(null);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <code className="rounded bg-background px-2 py-1 text-xs">{team.deploy_command}</code>
        {running ? (
          <Button type="button" variant="ghost" className="ml-auto h-8 border border-border px-3 text-xs" onClick={() => running.abort()}>
            <Square className="mr-1 h-3.5 w-3.5" /> Stop
          </Button>
        ) : (
          <Button type="button" className="ml-auto h-8 px-3 text-xs" disabled={disabled} onClick={() => void deploy()}>
            <Rocket className="mr-1 h-3.5 w-3.5" /> Deploy
          </Button>
        )}
      </div>
      {disabled ? <p className="mt-1 text-xs text-foreground-muted">Wait for the run to finish before deploying.</p> : null}
      {output ? <Console className="mt-3" text={output} /> : null}
    </div>
  );
}
