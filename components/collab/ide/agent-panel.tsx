"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowUp, Square } from "lucide-react";

import { cn } from "@/lib/utils";
import { api, type ApiAccess } from "@/services/api";
import type { CollabMessage, CollabRunStatus, CollabTeam } from "@/types";

import { ApprovalCard, pendingApprovals } from "../activity-feed";

const ACTIVITY_DOT: Record<string, string> = {
  planning: "bg-sky-500",
  coding: "bg-emerald-500",
  reviewing: "bg-amber-500",
  testing: "bg-violet-500",
  waiting: "bg-red-500",
  summarizing: "bg-sky-500",
};

/**
 * The team you supervise: who's doing what right now, what's waiting on
 * you, and where you hand them the next task.
 */
export function AgentPanel({
  access,
  team,
  messages,
  status,
  runActive,
  currentRunId,
  onStarted,
}: {
  access: ApiAccess;
  team: CollabTeam;
  messages: CollabMessage[];
  status: CollabRunStatus | null;
  runActive: boolean;
  currentRunId: string | null;
  onStarted: (runId: string) => void;
}) {
  const [task, setTask] = useState("");
  const start = useMutation({
    mutationFn: () => api.startCollabRun(access, team.id, task),
    onSuccess: (run) => {
      setTask("");
      onStarted(run.id);
    },
  });
  const cancel = useMutation({ mutationFn: () => api.cancelCollabRun(access, currentRunId!) });

  const activityOf = new Map<string, { activity: string; text: string }>();
  const edits = new Map<string, number>();
  for (const message of messages) {
    if (!message.member_id) continue;
    if (typeof message.data.activity === "string") activityOf.set(message.member_id, { activity: message.data.activity, text: message.content });
    if (message.kind === "action") edits.set(message.member_id, (edits.get(message.member_id) ?? 0) + 1);
  }
  // A finished or interrupted run can't act on an answer, so its leftover requests aren't offered.
  const pending = runActive ? pendingApprovals(messages) : [];
  const summary = [...messages].reverse().find((message) => message.kind === "summary");
  const nameOf = (memberId: string | null) => team.members.find((member) => member.id === memberId)?.name ?? "Chikaima";

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex h-9 shrink-0 items-center justify-between px-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground-muted">Team</span>
        <span className="text-[11px] text-muted">{team.members.length} agents</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <ul className="space-y-0.5">
          {team.members.map((member) => {
            const current = runActive ? activityOf.get(member.id) : undefined;
            const active = current && current.activity !== "idle" ? current : null;
            return (
              <li key={member.id} className={cn("rounded-md px-2 py-1.5", active && "bg-background")} title={member.instructions || undefined}>
                <div className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", active ? `${ACTIVITY_DOT[active.activity] ?? "bg-primary"} animate-pulse` : "bg-border")} />
                  <span className="min-w-0 truncate text-[12.5px] font-medium text-foreground">{member.name}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-foreground-muted">{active ? active.activity : "idle"}</span>
                </div>
                <p className="truncate pl-4 text-[11px] text-muted">
                  #{member.precedence} · {member.title || member.role}
                  {edits.get(member.id) ? ` · ${edits.get(member.id)} edits` : ""}
                </p>
              </li>
            );
          })}
        </ul>

        {pending.length > 0 ? (
          <div className="mt-3 space-y-2">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-600">Needs your approval ({pending.length})</p>
            {pending.map((message) => (
              <ApprovalCard key={message.id} access={access} message={message} who={nameOf(message.member_id)} />
            ))}
          </div>
        ) : null}

        {summary && !runActive ? (
          <div className="mt-3 rounded-lg border border-border bg-background p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground-muted">Lead&apos;s report</p>
            <p className="mt-1.5 whitespace-pre-wrap text-xs text-foreground">{summary.content}</p>
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-border p-2">
        {runActive ? (
          <div className="mb-2 flex items-center gap-2 rounded-md bg-background px-2 py-1.5 text-xs">
            <span className={cn("h-2 w-2 rounded-full", status === "awaiting_approval" ? "bg-amber-500" : "animate-pulse bg-emerald-500")} />
            <span className="text-foreground">{status === "awaiting_approval" ? "Waiting for you" : status === "cancelling" ? "Stopping…" : "Team is working"}</span>
            {status !== "cancelling" ? (
              <button type="button" onClick={() => cancel.mutate()} disabled={cancel.isPending} className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-foreground-muted hover:bg-surface-strong hover:text-foreground">
                <Square className="h-3 w-3" /> Stop
              </button>
            ) : null}
          </div>
        ) : null}
        <form
          className="relative"
          onSubmit={(event) => {
            event.preventDefault();
            if (task.trim() && !runActive) start.mutate();
          }}
        >
          <textarea
            value={task}
            onChange={(event) => setTask(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                if (task.trim() && !runActive) start.mutate();
              }
            }}
            disabled={runActive}
            placeholder={runActive ? "The team is on a task…" : "Describe a task for the team… (⌘/Ctrl + Enter)"}
            className="h-24 w-full resize-none rounded-lg border border-border bg-background p-2.5 pr-10 text-[13px] text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
          />
          <button
            type="submit"
            aria-label="Start run"
            disabled={!task.trim() || runActive || start.isPending}
            className="absolute bottom-2.5 right-2 flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-40"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </form>
        {start.error ? <p className="mt-1 text-xs text-destructive">{start.error.message}</p> : null}
        {cancel.error ? <p className="mt-1 text-xs text-destructive">{cancel.error.message}</p> : null}
      </div>
    </div>
  );
}
