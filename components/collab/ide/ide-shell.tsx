"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Files, GitBranch, History, Moon, PanelRight, Settings2, ShieldAlert, SunMedium, Undo2 } from "lucide-react";

import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";
import { api, type ApiAccess } from "@/services/api";
import type { AIModel, CollabFileChange, CollabMessage, CollabRunStatus, CollabTeam } from "@/types";

import { languageFor } from "../code-editor";
import { ACTIVE_STATUSES, AUTONOMY_LABELS } from "../constants";
import { AgentPanel } from "./agent-panel";
import { BottomPanel, type BottomTab } from "./bottom-panel";
import { EditorArea, type EditorTab } from "./editor-area";
import { Explorer } from "./explorer";
import { ResizeHandle, usePanelSize } from "./panel-size";
import { RunsPanel, SourceControl } from "./side-panels";

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

function withoutKey(record: Record<string, string>, key: string): Record<string, string> {
  const copy = { ...record };
  delete copy[key];
  return copy;
}

type SideView = "explorer" | "git" | "runs";

const ACTIVITY_BAR: Array<{ id: SideView; label: string; icon: typeof Files }> = [
  { id: "explorer", label: "Explorer", icon: Files },
  { id: "git", label: "Source control", icon: GitBranch },
  { id: "runs", label: "Runs", icon: History },
];

/**
 * The AI team's coding workspace, laid out like an IDE: activity bar and
 * side panel (files, git, runs), editor tabs, a bottom panel (agent
 * activity, terminal, preview, tests, deploy), the team on the right, and a
 * status bar.
 */
export function IdeShell({
  access,
  team,
  teams,
  models,
  onSelectTeam,
  onNewTeam,
}: {
  access: ApiAccess;
  team: CollabTeam;
  teams: CollabTeam[];
  models: AIModel[];
  onSelectTeam: (id: string) => void;
  onNewTeam: () => void;
}) {
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();
  // On small screens the side and team panels are drawers over the editor, so start them closed there.
  const [side, setSide] = useState<SideView | null>(() => (typeof window !== "undefined" && window.innerWidth < 768 ? null : "explorer"));
  const [rightOpen, setRightOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 1024);
  const [bottomOpen, setBottomOpen] = useState(true);
  const [bottomTab, setBottomTab] = useState<BottomTab>("activity");
  const [sideWidth, dragSide] = usePanelSize("side", 260, 180, 480, "x", 1);
  const [rightWidth, dragRight] = usePanelSize("right", 320, 260, 520, "x", -1);
  const [bottomHeight, dragBottom] = usePanelSize("bottom", 280, 120, 700, "y", -1);

  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const runsQuery = useQuery({ queryKey: ["collab-runs", team.id], queryFn: () => api.getCollabRuns(access, team.id) });
  const runs = useMemo(() => runsQuery.data ?? [], [runsQuery.data]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const currentRunId = selectedRunId ?? runs[0]?.id ?? null;
  const onFinished = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["collab-runs", team.id] });
    void queryClient.invalidateQueries({ queryKey: ["collab-git", team.id] });
    void queryClient.invalidateQueries({ queryKey: ["collab-files", team.id] });
  }, [queryClient, team.id]);
  const { messages, status, error } = useRunStream(access, currentRunId, onFinished);
  const runActive = status !== null && ACTIVE_STATUSES.includes(status);

  const filesQuery = useQuery({ queryKey: ["collab-files", team.id], queryFn: () => api.getCollabFiles(access, team.id) });
  const gitQuery = useQuery({ queryKey: ["collab-git", team.id], queryFn: () => api.getCollabGit(access, team.id) });
  const folderChanges = messages.filter((message) => message.kind === "action" || message.kind === "decision").length;
  const { refetch: refetchFiles } = filesQuery;
  const { refetch: refetchGit } = gitQuery;
  useEffect(() => {
    if (folderChanges === 0) return;
    void refetchFiles();
    void refetchGit();
  }, [folderChanges, refetchFiles, refetchGit]);

  // Which agent touched which file in this run, for the explorer's markers.
  const touchedBy = useMemo(() => {
    const map = new Map<string, { rank: number; name: string }>();
    for (const message of messages) {
      const member = team.members.find((candidate) => candidate.id === message.member_id);
      if (message.kind === "action" && member && typeof message.data.path === "string" && !message.data.worktree) map.set(message.data.path, { rank: member.precedence, name: member.name });
    }
    return map;
  }, [messages, team.members]);
  const activeAgents = useMemo(() => {
    const latest = new Map<string, string>();
    for (const message of messages) if (message.member_id && typeof message.data.activity === "string") latest.set(message.member_id, message.data.activity);
    return runActive ? [...latest.values()].filter((activity) => activity !== "idle").length : 0;
  }, [messages, runActive]);
  const waiting = status === "awaiting_approval";

  const openTab = (tab: EditorTab) => {
    setTabs((current) => (current.some((existing) => existing.id === tab.id) ? current : [...current, tab]));
    setActiveTab(tab.id);
  };
  const openFile = (path: string) => openTab({ id: `file:${path}`, kind: "file", path });
  const openDiff = (title: string, files: CollabFileChange[]) => openTab({ id: `diff:${title}:${files.map((file) => file.path).join(",")}`, kind: "diff", title, files });
  const closeTab = (id: string) => {
    const tab = tabs.find((candidate) => candidate.id === id);
    if (tab?.kind === "file" && drafts[tab.path] !== undefined && !window.confirm(`Discard unsaved changes to ${tab.path}?`)) return;
    if (tab?.kind === "file") setDrafts((current) => withoutKey(current, tab.path));
    const remaining = tabs.filter((candidate) => candidate.id !== id);
    setTabs(remaining);
    if (activeTab === id) setActiveTab(remaining.at(-1)?.id ?? null);
  };
  const active = tabs.find((tab) => tab.id === activeTab);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground">
      {/* Title bar */}
      <header className="flex h-10 shrink-0 items-center gap-3 border-b border-border bg-surface px-3">
        <Link href="/chat" className="flex items-center gap-2" title="Back to Chikaima">
          <Image src="/chikaima-logo.png" alt="Chikaima" width={20} height={20} className="h-5 w-5 object-contain" />
          <span className="hidden text-[11px] font-semibold uppercase tracking-[0.22em] sm:inline">Chikaima</span>
        </Link>
        <span className="text-border">/</span>
        <select
          aria-label="Team"
          value={team.id}
          onChange={(event) => (event.target.value === "__new" ? onNewTeam() : onSelectTeam(event.target.value))}
          className="h-7 max-w-52 rounded-md border border-transparent bg-transparent px-1 text-[13px] font-medium hover:border-border focus:outline-none"
        >
          {teams.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
          <option value="__new">+ New team…</option>
        </select>
        <span className="hidden font-mono text-[11px] text-foreground-muted md:inline">{team.folder}</span>

        <div className="mx-auto flex items-center gap-2 text-xs">
          {waiting ? (
            <button type="button" onClick={() => setRightOpen(true)} className="flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 font-medium text-amber-700 dark:text-amber-400">
              <ShieldAlert className="h-3.5 w-3.5" /> Waiting for your approval
            </button>
          ) : runActive ? (
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/12 px-3 py-1 font-medium text-emerald-700 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> {activeAgents || "Agents"} {activeAgents === 1 ? "agent" : "agents"} working
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1">
          <button type="button" title="Team settings" aria-label="Team settings" onClick={() => openTab({ id: "settings", kind: "settings" })} className="rounded p-1.5 text-foreground-muted hover:bg-surface-strong hover:text-foreground">
            <Settings2 className="h-4 w-4" />
          </button>
          <button type="button" title="Toggle theme" aria-label="Toggle theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="rounded p-1.5 text-foreground-muted hover:bg-surface-strong hover:text-foreground">
            {theme === "dark" ? <SunMedium className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            type="button"
            title="Toggle team panel"
            aria-label="Toggle team panel"
            onClick={() => setRightOpen((value) => !value)}
            className={cn("rounded p-1.5 hover:bg-surface-strong", rightOpen ? "text-foreground" : "text-foreground-muted")}
          >
            <PanelRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Activity bar */}
        <nav className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-border bg-surface py-2" aria-label="Workspace views">
          {ACTIVITY_BAR.map((item) => (
            <button
              key={item.id}
              type="button"
              title={item.label}
              aria-label={item.label}
              aria-pressed={side === item.id}
              onClick={() => setSide((current) => (current === item.id ? null : item.id))}
              className={cn(
                "relative flex h-10 w-10 items-center justify-center rounded-md",
                side === item.id ? "text-foreground before:absolute before:-left-1 before:h-6 before:w-0.5 before:rounded before:bg-primary" : "text-foreground-muted hover:text-foreground",
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.id === "git" && gitQuery.data?.changes.length ? (
                <span className="absolute right-1 top-1 rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">{gitQuery.data.changes.length}</span>
              ) : null}
            </button>
          ))}
          <button
            type="button"
            title="Team"
            aria-label="Team"
            onClick={() => setRightOpen((value) => !value)}
            className={cn("relative flex h-10 w-10 items-center justify-center rounded-md", rightOpen ? "text-foreground" : "text-foreground-muted hover:text-foreground")}
          >
            <Bot className="h-5 w-5" />
            {waiting ? <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-500" /> : null}
          </button>
          <Link href="/chat" title="Back to Chikaima" aria-label="Back to Chikaima" className="mt-auto flex h-10 w-10 items-center justify-center rounded-md text-foreground-muted hover:text-foreground">
            <Undo2 className="h-5 w-5" />
          </Link>
        </nav>

        {/* Side panel */}
        {side ? (
          <>
            <aside
              className="fixed bottom-6 left-12 top-10 z-30 min-h-0 w-[min(300px,80vw)] border-r border-border bg-surface shadow-2xl md:static md:z-auto md:w-[var(--side-width)] md:shrink-0 md:border-r-0 md:shadow-none"
              style={{ "--side-width": `${sideWidth}px` } as React.CSSProperties}
            >
              {side === "explorer" ? (
                <Explorer
                  folder={team.folder}
                  entries={filesQuery.data?.entries ?? []}
                  truncated={filesQuery.data?.truncated ?? false}
                  activePath={active?.kind === "file" ? active.path : null}
                  touchedBy={touchedBy}
                  onOpen={openFile}
                  onRefresh={() => void filesQuery.refetch()}
                />
              ) : null}
              {side === "git" ? <SourceControl access={access} team={team} disabled={runActive} onOpenFile={openFile} onOpenCommit={(hash, title) => openTab({ id: `commit:${hash}`, kind: "commit", hash, title })} /> : null}
              {side === "runs" ? (
                <RunsPanel
                  runs={runs}
                  selectedId={currentRunId}
                  onSelect={(id) => {
                    setSelectedRunId(id);
                    setBottomTab("activity");
                    setBottomOpen(true);
                  }}
                />
              ) : null}
            </aside>
            <div className="hidden md:flex">
              <ResizeHandle axis="x" onPointerDown={dragSide} />
            </div>
          </>
        ) : null}

        {/* Editor + bottom panel */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <EditorArea
              access={access}
              team={team}
              models={models}
              tabs={tabs}
              activeId={activeTab}
              drafts={drafts}
              agentsWorking={runActive}
              refreshKey={folderChanges}
              onActivate={setActiveTab}
              onClose={closeTab}
              onDraft={(path, value) =>
                setDrafts((current) => (value === undefined ? withoutKey(current, path) : { ...current, [path]: value }))
              }
              onTeamSaved={() => closeTab("settings")}
            />
          </div>
          {bottomOpen ? <ResizeHandle axis="y" onPointerDown={dragBottom} /> : <div className="h-px bg-border" />}
          <div className="shrink-0" style={{ height: bottomOpen ? bottomHeight : 32 }}>
            <BottomPanel
              access={access}
              team={team}
              messages={messages}
              hasRun={Boolean(currentRunId)}
              agentsWorking={runActive}
              tab={bottomTab}
              open={bottomOpen}
              onTab={setBottomTab}
              onToggle={() => setBottomOpen((value) => !value)}
              onOpenDiff={openDiff}
            />
          </div>
        </main>

        {/* Team panel */}
        {rightOpen ? (
          <>
            <div className="hidden lg:flex">
              <ResizeHandle axis="x" onPointerDown={dragRight} />
            </div>
            <aside
              className="fixed bottom-6 right-0 top-10 z-30 min-h-0 w-[min(360px,90vw)] border-l border-border shadow-2xl lg:static lg:z-auto lg:w-[var(--right-width)] lg:shrink-0 lg:border-l-0 lg:shadow-none"
              style={{ "--right-width": `${rightWidth}px` } as React.CSSProperties}
            >
              <AgentPanel
                access={access}
                team={team}
                messages={messages}
                status={status}
                runActive={runActive}
                currentRunId={currentRunId}
                onStarted={(runId) => {
                  setSelectedRunId(runId);
                  setBottomTab("activity");
                  setBottomOpen(true);
                  void queryClient.invalidateQueries({ queryKey: ["collab-runs", team.id] });
                }}
              />
            </aside>
          </>
        ) : null}
      </div>

      {/* Status bar */}
      <footer className={cn("flex h-6 shrink-0 items-center gap-4 px-3 text-[11px]", waiting ? "bg-amber-600 text-white" : runActive ? "bg-primary text-primary-foreground" : "bg-surface-strong text-foreground-muted")}>
        {gitQuery.data?.is_repo ? (
          <span className="flex items-center gap-1">
            <GitBranch className="h-3 w-3" /> {gitQuery.data.branch}
            {gitQuery.data.changes.length ? `*` : ""}
          </span>
        ) : (
          <span>no git</span>
        )}
        <span>{status ? status.replace("_", " ") : "idle"}</span>
        {error ? <span className="truncate">{error}</span> : null}
        <span className="ml-auto hidden sm:inline">{AUTONOMY_LABELS[team.autonomy]?.label ?? team.autonomy}</span>
        <span className="hidden sm:inline">{team.decision_policy} review</span>
        <span className="hidden sm:inline">{team.max_model_calls} calls max</span>
        {team.parallel ? <span className="hidden sm:inline">parallel</span> : null}
        {active?.kind === "file" ? <span>{languageFor(active.path)}</span> : null}
      </footer>
    </div>
  );
}
