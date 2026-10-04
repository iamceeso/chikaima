"use client";

import { Activity, ChevronDown, ChevronUp, CircleAlert, Eye, FlaskConical, GitBranch, Rocket, SquareTerminal } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ApiAccess } from "@/services/api";
import type { CollabFileChange, CollabMessage, CollabTeam } from "@/types";

import { ActivityFeed } from "../activity-feed";
import { GitChangesView, ProblemsView, problemsFrom } from "./insights";
import { DeployPanel, PreviewPanel, TerminalPanel } from "../tool-panels";

export const BOTTOM_TABS = [
  { id: "terminal", label: "Terminal", icon: SquareTerminal },
  { id: "preview", label: "Preview", icon: Eye },
  { id: "problems", label: "Problems", icon: CircleAlert },
  { id: "tests", label: "Tests", icon: FlaskConical },
  { id: "git", label: "Git", icon: GitBranch },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "deploy", label: "Deploy", icon: Rocket },
] as const;
export type BottomTab = (typeof BOTTOM_TABS)[number]["id"];

/** Every test run in the current run: the team's test command and testers' verdicts. */
function TestsView({ team, messages }: { team: CollabTeam; messages: CollabMessage[] }) {
  const results = messages.filter((message) => (message.kind === "command" && (message.data.stage === "test" || String(message.data.command) === team.test_command)) || (message.kind === "review" && message.data.stage === "test"));
  if (!team.test_command && !team.members.some((member) => member.role === "tester")) {
    return <p className="text-sm text-foreground-muted">This team has no test command or tester agent. Add one in Team settings so changes are tested before they are kept.</p>;
  }
  if (results.length === 0) return <p className="text-sm text-foreground-muted">No tests have run in this run yet.</p>;
  return (
    <ol className="space-y-2">
      {results.map((message) => {
        const passed = message.kind === "command" ? message.data.exit_code === 0 : message.data.vote === "approve";
        const agent = team.members.find((member) => member.id === message.member_id);
        return (
          <li key={message.id} className="rounded-lg border border-border">
            <details>
              <summary className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs">
                <span className={cn("font-semibold", passed ? "text-emerald-600" : "text-red-600")}>{passed ? "PASS" : "FAIL"}</span>
                <span className="text-foreground">Step {Number(message.data.step ?? 0) + 1}</span>
                <span className="truncate text-foreground-muted">{message.kind === "command" ? `$ ${String(message.data.command)}` : `${agent?.name ?? "Tester"}: ${message.content.split("\n")[0]}`}</span>
                <span className="ml-auto text-muted">{new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </summary>
              <pre className="max-h-64 overflow-auto border-t border-border bg-zinc-950 p-3 font-mono text-[11px] text-zinc-100">{message.content}</pre>
            </details>
          </li>
        );
      })}
    </ol>
  );
}

export function BottomPanel({
  access,
  team,
  messages,
  hasRun,
  agentsWorking,
  tab,
  open,
  onTab,
  onToggle,
  onOpenDiff,
  onOpenCommit,
}: {
  access: ApiAccess;
  team: CollabTeam;
  messages: CollabMessage[];
  hasRun: boolean;
  agentsWorking: boolean;
  tab: BottomTab;
  open: boolean;
  onTab: (tab: BottomTab) => void;
  onToggle: () => void;
  onOpenDiff: (title: string, files: CollabFileChange[]) => void;
  onOpenCommit: (hash: string, title: string) => void;
}) {
  const problemCount = problemsFrom(messages, team).length;
  const testRuns = messages.filter((message) => message.kind === "command" && message.data.stage === "test");
  const testsFailed = testRuns.some((message) => message.data.exit_code !== 0);
  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex h-8 shrink-0 items-center gap-0.5 overflow-x-auto px-2" role="tablist">
        {BOTTOM_TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={open && tab === entry.id}
            onClick={() => (open && tab === entry.id ? onToggle() : (onTab(entry.id), !open && onToggle()))}
            className={cn(
              "flex h-full shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 text-[11px] font-medium uppercase tracking-[0.08em]",
              open && tab === entry.id ? "border-primary text-foreground" : "border-transparent text-foreground-muted hover:text-foreground",
            )}
          >
            <entry.icon className="h-3.5 w-3.5" /> {entry.label}
            {entry.id === "problems" && problemCount ? <span className="rounded-full bg-red-500/15 px-1.5 text-[10px] text-red-600">{problemCount}</span> : null}
            {entry.id === "tests" && testRuns.length ? <span className={cn("h-1.5 w-1.5 rounded-full", testsFailed ? "bg-red-500" : "bg-emerald-500")} /> : null}
          </button>
        ))}
        <button type="button" aria-label={open ? "Hide panel" : "Show panel"} onClick={onToggle} className="ml-auto rounded p-1 text-foreground-muted hover:bg-surface-strong hover:text-foreground">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      </div>
      <div className={cn("min-h-0 flex-1 overflow-y-auto px-3 pb-3", !open && "hidden")}>
        {tab === "activity" ? (
          hasRun ? (
            <ActivityFeed access={access} team={team} messages={messages} hideApprovals onOpenDiff={onOpenDiff} />
          ) : (
            <p className="pt-2 text-sm text-foreground-muted">No runs yet. Agent activity — plans, edits, reviews, tests and decisions — streams here.</p>
          )
        ) : null}
        {/* Kept mounted while hidden so a running command survives switching tabs. */}
        <div className={tab === "terminal" ? "pt-1" : "hidden"}>
          <TerminalPanel access={access} team={team} disabled={agentsWorking} />
        </div>
        {tab === "preview" ? (
          <div className="pt-1">
            <PreviewPanel access={access} team={team} />
          </div>
        ) : null}
        {tab === "problems" ? <ProblemsView messages={messages} team={team} /> : null}
        {tab === "git" ? <GitChangesView access={access} team={team} onOpenCommit={onOpenCommit} /> : null}
        {tab === "tests" ? (
          <div className="pt-1">
            <TestsView team={team} messages={messages} />
          </div>
        ) : null}
        <div className={tab === "deploy" ? "pt-1" : "hidden"}>
          <DeployPanel access={access} team={team} disabled={agentsWorking} />
        </div>
      </div>
    </div>
  );
}
