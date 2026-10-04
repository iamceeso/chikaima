"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Code2, Eye, Files, FolderGit2, GitBranch, KanbanSquare, Moon, PanelRight, Play, Search, Settings2, ShieldAlert, SunMedium, Users } from "lucide-react";

import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";
import { api, type ApiAccess } from "@/services/api";
import type { AIModel, CollabFileChange, CollabMessage, CollabRunStatus, CollabTeam } from "@/types";

import { languageFor } from "../code-editor";
import { ACTIVE_STATUSES, AUTONOMY_LABELS } from "../constants";
import { TeamEditor } from "../team-editor";
import { AgentPanel } from "./agent-panel";
import { BottomPanel, type BottomTab } from "./bottom-panel";
import { EditorArea, type EditorTab } from "./editor-area";
import { Explorer, type AgentFileMark } from "./explorer";
import { ResizeHandle, usePanelSize } from "./panel-size";
import { RunsPanel, SearchPanel, SourceControl } from "./side-panels";
import { TaskBoard } from "./task-board";

export type WorkspaceView = "code" | "tasks" | "team" | "settings";

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

type SidePanel = "explorer" | "search" | "git" | "runs";

/**
 * A project's development environment: activity bar, side panel (files,
 * search, source control, task runs), the editor (or the task board, AI
 * team and project settings), the bottom tool panel, the AI team on the
 * right, and a status bar. Mounted from the project layout, so open tabs,
 * the live run and panel state survive switching views.
 */
export function IdeShell({ access, team, projects, models, view }: { access: ApiAccess; team: CollabTeam; projects: CollabTeam[]; models: AIModel[]; view: WorkspaceView }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();
  const base = `/projects/${team.id}`;

  // On small screens the side and team panels are drawers over the editor, so start them closed there.
  const [side, setSide] = useState<SidePanel | null>(() => (typeof window !== "undefined" && window.innerWidth < 768 ? null : "explorer"));
  const [rightOpen, setRightOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 1024);
  const [bottomOpen, setBottomOpen] = useState(true);
  const [bottomTab, setBottomTab] = useState<BottomTab>("activity");
  const [sideWidth, dragSide] = usePanelSize("side", 260, 180, 480, "x", 1);
  const [rightWidth, dragRight] = usePanelSize("right", 330, 260, 520, "x", -1);
  const [bottomHeight, dragBottom] = usePanelSize("bottom", 260, 120, 700, "y", -1);
  const [composerSeed, setComposerSeed] = useState<{ text: string; key: number } | null>(null);

  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const runsQuery = useQuery({ queryKey: ["collab-runs", team.id], queryFn: () => api.getCollabRuns(access, team.id) });
  const runs = useMemo(() => runsQuery.data ?? [], [runsQuery.data]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const currentRunId = selectedRunId ?? runs[0]?.id ?? null;
  const onFinished = useCallback(() => {
    for (const key of ["collab-runs", "collab-git", "collab-files", "collab-tasks"]) void queryClient.invalidateQueries({ queryKey: [key, team.id] });
    void queryClient.invalidateQueries({ queryKey: ["collab-projects"] });
  }, [queryClient, team.id]);
  const { messages, status, error } = useRunStream(access, currentRunId, onFinished);
  const runActive = status !== null && ACTIVE_STATUSES.includes(status);
  const waiting = status === "awaiting_approval";

  const filesQuery = useQuery({ queryKey: ["collab-files", team.id], queryFn: () => api.getCollabFiles(access, team.id) });
  const gitQuery = useQuery({ queryKey: ["collab-git", team.id], queryFn: () => api.getCollabGit(access, team.id) });
  const previewQuery = useQuery({
    queryKey: ["collab-preview", team.id],
    queryFn: () => api.getCollabPreview(access, team.id),
    refetchInterval: (query) => (query.state.data && ["starting", "running"].includes(query.state.data.status) ? 5_000 : false),
  });
  const runPreview = useMutation({
    mutationFn: () => api.startCollabPreview(access, team.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["collab-preview", team.id] });
      setBottomTab("preview");
      setBottomOpen(true);
    },
  });

  // Agents edit the folder during a run: keep the tree, git status and tasks current.
  const folderChanges = messages.filter((message) => message.kind === "action" || message.kind === "decision").length;
  const { refetch: refetchFiles } = filesQuery;
  const { refetch: refetchGit } = gitQuery;
  useEffect(() => {
    if (folderChanges === 0) return;
    void refetchFiles();
    void refetchGit();
    void queryClient.invalidateQueries({ queryKey: ["collab-tasks", team.id] });
  }, [folderChanges, refetchFiles, refetchGit, queryClient, team.id]);

  // Which agent touched which file in this task, and which file each active agent is on now.
  const { agentFiles, agentEditing, agentTouched, activeAgents } = useMemo(() => {
    const files = new Map<string, AgentFileMark>();
    const editing = new Map<string, string>();
    const latestActivity = new Map<string, string>();
    const latestPath = new Map<string, string>();
    for (const message of messages) {
      if (!message.member_id) continue;
      if (typeof message.data.activity === "string") latestActivity.set(message.member_id, message.data.activity);
      if (message.kind === "action" && typeof message.data.path === "string" && !message.data.worktree && message.data.action !== "browse" && message.data.action !== "screenshot") {
        latestPath.set(message.member_id, message.data.path);
        const member = team.members.find((candidate) => candidate.id === message.member_id);
        if (member) files.set(message.data.path, { name: member.title || member.name, editing: false });
      }
    }
    let active = 0;
    if (runActive) {
      for (const [memberId, activity] of latestActivity) {
        if (activity === "idle") continue;
        active++;
        const path = latestPath.get(memberId);
        const member = team.members.find((candidate) => candidate.id === memberId);
        if (activity === "coding" && path && member) {
          files.set(path, { name: member.title || member.name, editing: true });
          editing.set(path, member.title || member.name);
        }
      }
    }
    return { agentFiles: files, agentEditing: editing, agentTouched: new Set(files.keys()), activeAgents: active };
  }, [messages, runActive, team.members]);
  const gitStatus = useMemo(() => new Map((gitQuery.data?.changes ?? []).map((change) => [change.path, change.code])), [gitQuery.data]);

  const openTab = (tab: EditorTab) => {
    setTabs((current) => (current.some((existing) => existing.id === tab.id) ? current.map((existing) => (existing.id === tab.id ? tab : existing)) : [...current, tab]));
    setActiveTab(tab.id);
    if (view !== "code") router.push(base);
  };
  const openFile = (path: string, line?: number) => openTab({ id: `file:${path}`, kind: "file", path, line: line ? { number: line, key: Date.now() } : undefined });
  const openDiff = (title: string, files: CollabFileChange[]) => openTab({ id: `diff:${title}`, kind: "diff", title, files });
  const openCommit = (hash: string, title: string) => openTab({ id: `commit:${hash}`, kind: "commit", hash, title });
  const closeTab = (id: string) => {
    const tab = tabs.find((candidate) => candidate.id === id);
    if (tab?.kind === "file" && drafts[tab.path] !== undefined && !window.confirm(`Discard unsaved changes to ${tab.path}?`)) return;
    if (tab?.kind === "file") setDrafts((current) => withoutKey(current, tab.path));
    const remaining = tabs.filter((candidate) => candidate.id !== id);
    setTabs(remaining);
    if (activeTab === id) setActiveTab(remaining.at(-1)?.id ?? null);
  };
  const openRun = (runId: string) => {
    setSelectedRunId(runId);
    setBottomTab("activity");
    setBottomOpen(true);
    setRightOpen(true);
    if (view !== "code") router.push(base);
  };
  const active = tabs.find((tab) => tab.id === activeTab);
  const preview = previewQuery.data;
  const runtimeUp = preview?.status === "running" || preview?.status === "starting";

  const viewLinks: Array<{ id: WorkspaceView; label: string; icon: typeof Code2; href: string }> = [
    { id: "tasks", label: "Tasks", icon: KanbanSquare, href: `${base}/tasks` },
    { id: "team", label: "AI Team", icon: Users, href: `${base}/team` },
    { id: "settings", label: "Project settings", icon: Settings2, href: `${base}/settings` },
  ];
  const panels: Array<{ id: SidePanel; label: string; icon: typeof Files }> = [
    { id: "explorer", label: "Explorer", icon: Files },
    { id: "search", label: "Search", icon: Search },
    { id: "git", label: "Source control", icon: GitBranch },
  ];

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground">
      {/* Project header */}
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 text-xs">
        <Link href="/projects" className="flex items-center gap-1.5" title="All projects">
          <Image src="/chikaima-logo.png" alt="Chikaima" width={18} height={18} className="h-4.5 w-4.5 object-contain" />
          <span className="hidden text-[11px] font-semibold uppercase tracking-[0.2em] sm:inline">Chikaima</span>
        </Link>
        <span className="text-muted">/</span>
        <select
          aria-label="Project"
          value={team.id}
          onChange={(event) => router.push(event.target.value === "__new" ? "/projects/new" : `/projects/${event.target.value}`)}
          className="h-7 max-w-48 rounded-md border border-transparent bg-transparent px-1 text-[13px] font-semibold hover:border-border focus:outline-none"
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
          <option value="__new">+ New project…</option>
        </select>

        {gitQuery.data?.branch ? (
          <button
            type="button"
            onClick={() => {
              setSide("git");
              if (view !== "code") router.push(base);
            }}
            className="hidden items-center gap-1 rounded-md px-1.5 py-1 font-mono text-[11.5px] text-foreground-muted hover:bg-surface-strong hover:text-foreground sm:flex"
            title="Source control"
          >
            <GitBranch className="h-3.5 w-3.5" />
            {gitQuery.data.branch}
            {gitQuery.data.changes.length ? <span className="text-amber-600">*</span> : null}
          </button>
        ) : null}
        <span className="hidden items-center gap-1.5 text-foreground-muted md:flex">
          <span className={cn("h-1.5 w-1.5 rounded-full", preview?.status === "running" ? "bg-emerald-500" : preview?.status === "starting" ? "animate-pulse bg-amber-500" : "bg-border")} />
          {preview?.status === "running" ? "Runtime running" : preview?.status === "starting" ? "Runtime starting" : "Runtime stopped"}
        </span>
        {waiting ? (
          <button type="button" onClick={() => setRightOpen(true)} className="flex items-center gap-1.5 rounded-md bg-amber-500/15 px-2 py-1 font-medium text-amber-700 dark:text-amber-400">
            <ShieldAlert className="h-3.5 w-3.5" /> Waiting for approval
          </button>
        ) : runActive ? (
          <span className="flex items-center gap-1.5 rounded-md bg-emerald-500/12 px-2 py-1 font-medium text-emerald-700 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> {activeAgents || 1} {activeAgents === 1 || !activeAgents ? "agent" : "agents"} active
          </span>
        ) : null}

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => (team.preview_command ? runPreview.mutate() : router.push(`${base}/settings`))}
            disabled={runPreview.isPending}
            title={team.preview_command ? (runtimeUp ? "Restart the dev server" : "Start the dev server") : "Set a preview command in project settings"}
            className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 font-medium text-primary-foreground disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" /> {runtimeUp ? "Restart" : "Run"}
          </button>
          <button
            type="button"
            onClick={() => {
              setBottomTab("preview");
              setBottomOpen(true);
            }}
            className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-foreground-muted hover:text-foreground"
          >
            <Eye className="h-3.5 w-3.5" /> Preview
          </button>
          <button type="button" title="Toggle theme" aria-label="Toggle theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="rounded p-1.5 text-foreground-muted hover:bg-surface-strong hover:text-foreground">
            {theme === "dark" ? <SunMedium className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            type="button"
            title="Toggle AI team panel"
            aria-label="Toggle AI team panel"
            onClick={() => setRightOpen((value) => !value)}
            className={cn("rounded p-1.5 hover:bg-surface-strong", rightOpen ? "text-foreground" : "text-foreground-muted")}
          >
            <PanelRight className="h-4 w-4" />
          </button>
        </div>
      </header>
      {runPreview.error ? <p className="shrink-0 bg-red-500/10 px-3 py-1 text-xs text-destructive">{runPreview.error.message}</p> : null}

      <div className="flex min-h-0 flex-1">
        {/* Activity bar */}
        <nav className="flex w-12 shrink-0 flex-col items-center gap-0.5 border-r border-border bg-surface py-2" aria-label="Workspace">
          {panels.map((item) => {
            const on = view === "code" && side === item.id;
            return (
              <button
                key={item.id}
                type="button"
                title={item.label}
                aria-label={item.label}
                aria-pressed={on}
                onClick={() => {
                  if (view !== "code") {
                    setSide(item.id);
                    router.push(base);
                  } else setSide((current) => (current === item.id ? null : item.id));
                }}
                className={cn(
                  "relative flex h-10 w-10 items-center justify-center rounded-md",
                  on ? "text-foreground before:absolute before:-left-1 before:h-6 before:w-0.5 before:rounded before:bg-primary" : "text-foreground-muted hover:text-foreground",
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.id === "git" && gitQuery.data?.changes.length ? (
                  <span className="absolute right-1 top-1 rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">{gitQuery.data.changes.length}</span>
                ) : null}
              </button>
            );
          })}
          <div className="my-1 h-px w-6 bg-border" />
          {viewLinks.map((item) => (
            <Link
              key={item.id}
              href={view === item.id ? base : item.href}
              title={item.label}
              aria-label={item.label}
              aria-current={view === item.id ? "page" : undefined}
              className={cn(
                "relative flex h-10 w-10 items-center justify-center rounded-md",
                view === item.id ? "text-foreground before:absolute before:-left-1 before:h-6 before:w-0.5 before:rounded before:bg-primary" : "text-foreground-muted hover:text-foreground",
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.id === "team" && waiting ? <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-500" /> : null}
            </Link>
          ))}
          <Link href="/projects" title="All projects" aria-label="All projects" className="mt-auto flex h-10 w-10 items-center justify-center rounded-md text-foreground-muted hover:text-foreground">
            <FolderGit2 className="h-5 w-5" />
          </Link>
        </nav>

        {/* Side panel (code view) */}
        {view === "code" && side ? (
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
                  agentFiles={agentFiles}
                  gitStatus={gitStatus}
                  onOpen={(path) => openFile(path)}
                  onRefresh={() => void filesQuery.refetch()}
                />
              ) : null}
              {side === "search" ? <SearchPanel access={access} team={team} onOpen={openFile} /> : null}
              {side === "git" ? <SourceControl access={access} team={team} disabled={runActive} onOpenFile={(path) => openFile(path)} onOpenCommit={openCommit} /> : null}
              {side === "runs" ? <RunsPanel runs={runs} selectedId={currentRunId} onSelect={openRun} /> : null}
            </aside>
            <div className="hidden md:flex">
              <ResizeHandle axis="x" onPointerDown={dragSide} />
            </div>
          </>
        ) : null}

        {/* Centre: editor or the selected view, with the bottom tool panel */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            {view === "code" ? (
              <EditorArea
                access={access}
                team={team}
                tabs={tabs}
                activeId={activeTab}
                drafts={drafts}
                agentsWorking={runActive}
                agentEditing={agentEditing}
                agentTouched={agentTouched}
                refreshKey={folderChanges}
                onActivate={setActiveTab}
                onClose={closeTab}
                onDraft={(path, value) => setDrafts((current) => (value === undefined ? withoutKey(current, path) : { ...current, [path]: value }))}
              />
            ) : null}
            {view === "tasks" ? <TaskBoard access={access} team={team} busy={runActive} onOpenRun={openRun} /> : null}
            {view === "team" || view === "settings" ? (
              <div className="h-full overflow-y-auto">
                <div className="mx-auto max-w-4xl p-6">
                  {runActive ? <p className="mb-4 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">Changes can be saved once the current task finishes.</p> : null}
                  <TeamEditor key={`${view}-${team.updated_at}`} access={access} models={models} team={team} section={view === "team" ? "team" : "project"} embedded onDone={() => undefined} />
                </div>
              </div>
            ) : null}
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
              onOpenCommit={openCommit}
            />
          </div>
        </main>

        {/* AI team */}
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
                models={models}
                messages={messages}
                status={status}
                runActive={runActive}
                currentRunId={currentRunId}
                composerSeed={composerSeed}
                onOpenDiff={openDiff}
                onStarted={(runId) => {
                  setComposerSeed(null);
                  openRun(runId);
                  void queryClient.invalidateQueries({ queryKey: ["collab-runs", team.id] });
                  void queryClient.invalidateQueries({ queryKey: ["collab-tasks", team.id] });
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
            {gitQuery.data.changes.length ? "*" : ""}
          </span>
        ) : (
          <span>no git</span>
        )}
        <button
          type="button"
          onClick={() => {
            setSide("runs");
            if (view !== "code") router.push(base);
          }}
          className="hover:underline"
          title="Task runs"
        >
          {status ? (waiting ? "waiting for approval" : status.replace("_", " ")) : "idle"}
        </button>
        {error ? <span className="truncate">{error}</span> : null}
        <span className="ml-auto hidden sm:inline">{AUTONOMY_LABELS[team.autonomy]?.label ?? team.autonomy}</span>
        <span className="hidden sm:inline">{team.members.length} agents</span>
        {team.parallel ? <span className="hidden sm:inline">parallel</span> : null}
        {view === "code" && active?.kind === "file" ? <span>{languageFor(active.path)}</span> : null}
      </footer>
    </div>
  );
}
