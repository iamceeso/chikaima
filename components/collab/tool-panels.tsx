"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Play, RefreshCw, Rocket, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { api, type ApiAccess } from "@/services/api";
import type { CollabTeam } from "@/types";


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
