"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowUp, ChevronDown, ChevronRight, GitPullRequestArrow, Square } from "lucide-react";

import { cn } from "@/lib/utils";
import { api, type ApiAccess } from "@/services/api";
import type { AIModel, CollabFileChange, CollabMember, CollabMessage, CollabRunStatus, CollabTeam } from "@/types";

import { ApprovalCard, pendingApprovals } from "../activity-feed";
import { PERMISSION_LABELS } from "../constants";

type AgentState = "Planning" | "Working" | "Reviewing" | "Testing" | "Needs approval" | "Waiting" | "Blocked" | "Complete" | "Idle";

const STATE_STYLE: Record<AgentState, { dot: string; text: string }> = {
  Planning: { dot: "bg-sky-500 animate-pulse", text: "text-sky-600 dark:text-sky-400" },
  Working: { dot: "bg-emerald-500 animate-pulse", text: "text-emerald-600 dark:text-emerald-400" },
  Reviewing: { dot: "bg-amber-500 animate-pulse", text: "text-amber-600 dark:text-amber-400" },
  Testing: { dot: "bg-violet-500 animate-pulse", text: "text-violet-600 dark:text-violet-400" },
  "Needs approval": { dot: "bg-red-500", text: "text-red-600 dark:text-red-400" },
  Waiting: { dot: "bg-border", text: "text-foreground-muted" },
  Blocked: { dot: "bg-red-500", text: "text-red-600 dark:text-red-400" },
  Complete: { dot: "bg-emerald-600", text: "text-foreground-muted" },
  Idle: { dot: "bg-border", text: "text-muted" },
};

const ACTIVITY_STATE: Record<string, AgentState> = {
  planning: "Planning",
  coding: "Working",
  summarizing: "Working",
  reviewing: "Reviewing",
  testing: "Testing",
  waiting: "Needs approval",
};

function minutesSince(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  return minutes < 1 ? "<1m" : minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

interface AgentView {
  member: CollabMember;
  state: AgentState;
  summary: string | null;
  since: string | null;
  steps: Array<{ index: number; instruction: string }>;
  files: string[];
  recent: CollabMessage[];
}

/** Each agent's state, current activity and footprint in the run, from the run's structured events. */
function describeAgents(team: CollabTeam, messages: CollabMessage[], runActive: boolean): AgentView[] {
  const plan = [...messages].reverse().find((message) => message.kind === "plan");
  const steps = ((plan?.data.steps as Array<{ assignee: number; instruction: string }> | undefined) ?? []).map((step, index) => ({ ...step, index }));
  const abandoned = new Set(messages.filter((message) => message.kind === "system" && message.content.includes("abandoned")).map((message) => Number(message.data.step)));
  const decided = new Set(messages.filter((message) => message.kind === "decision" && message.data.approved === true).map((message) => Number(message.data.step)));

  return team.members.map((member) => {
    const mine = messages.filter((message) => message.member_id === member.id);
    const status = [...mine].reverse().find((message) => typeof message.data.activity === "string");
    const mySteps = steps.filter((step) => step.assignee === member.precedence);
    const blocked = mySteps.some((step) => abandoned.has(step.index));
    const remaining = mySteps.some((step) => !decided.has(step.index) && !abandoned.has(step.index));
    const activity = status ? String(status.data.activity) : null;

    // Only an implementer whose steps are all settled is done mid-task; the lead, reviewers and testers have more to check.
    let state: AgentState;
    if (!runActive) state = blocked ? "Blocked" : mine.length ? "Complete" : "Idle";
    else if (activity && activity !== "idle") state = ACTIVITY_STATE[activity] ?? "Working";
    else if (blocked) state = "Blocked";
    else state = member.role === "implementer" && mine.length > 0 && !remaining ? "Complete" : "Waiting";

    const active = runActive && activity !== null && activity !== "idle";
    const stepIndex = status && typeof status.data.step === "number" ? status.data.step : null;
    const stepText = stepIndex !== null ? `step ${stepIndex + 1}` : "the change";
    const test = [...mine].reverse().find((message) => message.kind === "command" && message.data.stage === "test");
    let summary: string | null = null;
    if (active) {
      if (activity === "coding") summary = stepIndex !== null && steps[stepIndex] ? `Step ${stepIndex + 1}: ${steps[stepIndex]!.instruction}` : "Writing code";
      else if (activity === "reviewing") summary = `Reviewing ${stepText}`;
      else if (activity === "testing") summary = `Testing ${stepText}${test ? ` · last run ${test.data.exit_code === 0 ? "passed" : "failed"}` : ""}`;
      else if (activity === "planning") summary = "Planning the task";
      else if (activity === "summarizing") summary = "Writing the report";
      else if (activity === "waiting") summary = "Waiting for your approval";
    } else if (state === "Waiting" && remaining) {
      summary = `Next: ${mySteps.find((step) => !decided.has(step.index))?.instruction ?? ""}`;
    } else if (state === "Waiting" && runActive) {
      summary = member.role === "lead" ? "Will report when the work is done" : "Waiting for the next change to check";
    }

    return {
      member,
      state,
      summary,
      since: active && status ? status.created_at : null,
      steps: mySteps,
      files: Array.from(new Set(mine.filter((message) => message.kind === "action" && typeof message.data.path === "string").map((message) => String(message.data.path)))),
      recent: mine.filter((message) => ["action", "message", "review", "command", "change"].includes(message.kind)).slice(-6),
    };
  });
}

function AgentDetail({ view, team, models }: { view: AgentView; team: CollabTeam; models: AIModel[] }) {
  const { member } = view;
  const model = models.find((candidate) => candidate.id === member.model_id);
  const nameFor = (rank: number | null) => (rank ? (team.members.find((other) => other.precedence === rank)?.name ?? `#${rank}`) : "You");
  return (
    <div className="mt-1.5 space-y-2 border-t border-border pt-2 text-[11.5px]">
      <dl className="grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-0.5">
        <dt className="text-muted">Role</dt>
        <dd className="text-foreground">
          {member.title || member.role} <span className="text-muted">({member.role})</span>
        </dd>
        <dt className="text-muted">Model</dt>
        <dd className="truncate text-foreground">{model ? `${model.display_name}${model.provider_name ? ` · ${model.provider_name}` : ""}` : member.model_id}</dd>
        <dt className="text-muted">Reports to</dt>
        <dd className="text-foreground">{nameFor(member.reports_to)}</dd>
        {member.reviewed_by.length ? (
          <>
            <dt className="text-muted">Reviewed by</dt>
            <dd className="text-foreground">{member.reviewed_by.map((rank) => nameFor(rank)).join(", ")}</dd>
          </>
        ) : null}
        <dt className="text-muted">Can</dt>
        <dd className="text-foreground">{member.permissions.map((permission) => PERMISSION_LABELS[permission]).join(", ")}</dd>
        <dt className="text-muted">Files</dt>
        <dd className="font-mono text-foreground">{member.scope.length ? member.scope.join(", ") : "whole project"}</dd>
      </dl>
      {view.steps.length ? (
        <div>
          <p className="font-semibold uppercase tracking-widest text-muted">Assigned</p>
          <ul className="mt-0.5 space-y-0.5">
            {view.steps.map((step) => (
              <li key={step.index} className="text-foreground">
                Step {step.index + 1}: {step.instruction}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {view.files.length ? (
        <div>
          <p className="font-semibold uppercase tracking-widest text-muted">Files changed</p>
          <p className="mt-0.5 font-mono text-foreground">{view.files.join(", ")}</p>
        </div>
      ) : null}
      {view.recent.length ? (
        <div>
          <p className="font-semibold uppercase tracking-widest text-muted">Recent actions</p>
          <ul className="mt-0.5 space-y-0.5 text-foreground-muted">
            {view.recent.map((message) => (
              <li key={message.id} className="line-clamp-2">
                <span className="text-muted">{new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>{" "}
                {message.kind === "command"
                  ? `Ran ${String(message.data.command)} (${message.data.exit_code === 0 ? "passed" : "failed"})`
                  : message.kind === "review"
                    ? `${message.data.vote === "approve" ? "Approved" : message.data.vote === "reject" ? "Requested changes" : "Reviewed"}: ${message.content}`
                    : message.kind === "change"
                      ? `Submitted ${(message.data.files as string[] | undefined)?.length ?? 0} file(s) for review`
                      : message.content}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {member.instructions ? <p className="text-foreground-muted">“{member.instructions}”</p> : null}
    </div>
  );
}

/** "Review requested": the team finished and wants to merge its branch. The supervisor reviews the whole change before it lands. */
function MergeReview({
  access,
  team,
  message,
  messages,
  onOpenDiff,
  onRequestChanges,
}: {
  access: ApiAccess;
  team: CollabTeam;
  message: CollabMessage;
  messages: CollabMessage[];
  onOpenDiff: (title: string, files: CollabFileChange[]) => void;
  onRequestChanges: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  const [asking, setAsking] = useState(false);
  const base = String(message.data.base ?? "");
  const branch = String(message.data.branch ?? "");
  const commits = (message.data.commits as Array<{ hash: string; subject: string }> | undefined) ?? [];
  const files = new Set(messages.filter((entry) => entry.kind === "decision" && entry.data.approved === true).flatMap((entry) => (entry.data.files as string[] | undefined) ?? []));
  const tests = messages.filter((entry) => entry.kind === "command" && entry.data.stage === "test");
  const manifests = [...files].filter((file) => /(^|\/)(package\.json|composer\.json|requirements\.txt|pyproject\.toml|go\.mod|Cargo\.toml|Gemfile)$/.test(file));
  const resolve = useMutation({ mutationFn: (decision: "approve" | "reject") => api.resolveCollabApproval(access, message.run_id, String(message.data.approval_id), decision, decision === "reject" ? note || undefined : undefined) });
  const diff = useMutation({ mutationFn: () => api.compareBranches(access, team.id, base, branch), onSuccess: (changes) => onOpenDiff(`Review: ${branch.replace("chikaima/", "")}`, changes) });

  return (
    <div className="rounded-lg border border-primary/50 bg-primary/6 p-3">
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
        <GitPullRequestArrow className="h-4 w-4 text-primary" /> Review requested
      </p>
      <p className="mt-0.5 text-xs text-foreground-muted">The team finished. Merge {commits.length} commit(s) into {base}?</p>
      <ul className="mt-2 space-y-0.5 text-xs text-foreground">
        <li>{files.size} file(s) changed</li>
        <li className={tests.some((entry) => entry.data.exit_code !== 0) ? "text-red-600" : undefined}>
          {tests.length ? `${tests.filter((entry) => entry.data.exit_code === 0).length} of ${tests.length} test runs passed` : "No test runs"}
        </li>
        {manifests.length ? <li className="text-amber-700 dark:text-amber-400">Dependencies changed ({manifests.join(", ")})</li> : null}
      </ul>
      {asking ? (
        <textarea
          autoFocus
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="What should change?"
          className="mt-2 h-16 w-full resize-none rounded-md border border-border bg-background p-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
        />
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button type="button" onClick={() => diff.mutate()} disabled={diff.isPending} className="rounded-md border border-border bg-background px-2.5 py-1 text-xs text-foreground hover:border-primary">
          {diff.isPending ? "Loading…" : "View diff"}
        </button>
        <button
          type="button"
          disabled={resolve.isPending || resolve.isSuccess}
          onClick={() => {
            if (!asking) return setAsking(true);
            resolve.mutate("reject", { onSuccess: () => onRequestChanges(note) });
          }}
          className="rounded-md border border-border bg-background px-2.5 py-1 text-xs text-foreground hover:border-primary"
        >
          {asking ? "Send back" : "Request changes"}
        </button>
        <button type="button" disabled={resolve.isPending || resolve.isSuccess} onClick={() => resolve.mutate("approve")} className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground">
          Approve &amp; merge
        </button>
      </div>
      {resolve.error ?? diff.error ? <p className="mt-1 text-xs text-destructive">{(resolve.error ?? diff.error)!.message}</p> : null}
    </div>
  );
}

/**
 * The AI engineering team you supervise: who is doing what, what is
 * waiting on you, and where you assign the next task.
 */
export function AgentPanel({
  access,
  team,
  models,
  messages,
  status,
  runActive,
  currentRunId,
  composerSeed,
  onStarted,
  onOpenDiff,
}: {
  access: ApiAccess;
  team: CollabTeam;
  models: AIModel[];
  messages: CollabMessage[];
  status: CollabRunStatus | null;
  runActive: boolean;
  currentRunId: string | null;
  /** Text to put in the task box, e.g. after "Request changes". */
  composerSeed: { text: string; key: number } | null;
  onStarted: (runId: string) => void;
  onOpenDiff: (title: string, files: CollabFileChange[]) => void;
}) {
  const [task, setTask] = useState("");
  const [seenSeed, setSeenSeed] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [requested, setRequested] = useState<{ text: string; key: number } | null>(null);
  // Adopt a new seed (from props or a review request) when it arrives, without an effect.
  const seed = requested && (!composerSeed || requested.key > composerSeed.key) ? requested : composerSeed;
  if (seed && seed.key !== seenSeed) {
    setSeenSeed(seed.key);
    setTask(seed.text);
  }

  const start = useMutation({
    mutationFn: () => api.startCollabRun(access, team.id, task),
    onSuccess: (run) => {
      setTask("");
      onStarted(run.id);
    },
  });
  const cancel = useMutation({ mutationFn: () => api.cancelCollabRun(access, currentRunId!) });

  const agents = describeAgents(team, messages, runActive);
  // A finished or interrupted run can't act on an answer, so its leftover requests aren't offered.
  const pending = runActive ? pendingApprovals(messages) : [];
  const merge = pending.find((message) => message.data.approval_kind === "merge");
  const others = pending.filter((message) => message !== merge);
  const summary = [...messages].reverse().find((message) => message.kind === "summary");
  const nameOf = (memberId: string | null) => team.members.find((member) => member.id === memberId)?.name ?? "Chikaima";
  const working = agents.filter((agent) => !["Waiting", "Complete", "Idle", "Blocked"].includes(agent.state)).length;

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex h-9 shrink-0 items-center justify-between px-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground-muted">AI team</span>
        <span className="text-[11px] text-muted">{runActive && working ? `${working} active` : `${team.members.length} agents`}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {merge ? (
          <div className="mb-2">
            <MergeReview
              access={access}
              team={team}
              message={merge}
              messages={messages}
              onOpenDiff={onOpenDiff}
              onRequestChanges={(note) => setRequested({ text: `Address review feedback: ${note}`.trim(), key: Date.now() })}
            />
          </div>
        ) : null}
        {others.length ? (
          <div className="mb-2 space-y-2">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-red-600">Approval required ({others.length})</p>
            {others.map((message) => (
              <ApprovalCard key={message.id} access={access} message={message} who={nameOf(message.member_id)} />
            ))}
          </div>
        ) : null}

        <ul className="space-y-0.5">
          {agents.map((view) => {
            const open = expanded === view.member.id;
            const style = STATE_STYLE[view.state];
            return (
              <li key={view.member.id} className={cn("rounded-md px-2 py-1.5", (open || view.since) && "bg-background")}>
                <button type="button" onClick={() => setExpanded(open ? null : view.member.id)} className="w-full text-left" aria-expanded={open}>
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", style.dot)} />
                    <span className="min-w-0 truncate text-[12.5px] font-medium text-foreground">{view.member.title || view.member.name}</span>
                    <span className={cn("ml-auto shrink-0 text-[11px] font-medium", style.text)}>
                      {view.state}
                      {view.since ? ` · ${minutesSince(view.since)}` : ""}
                    </span>
                    {open ? <ChevronDown className="h-3 w-3 shrink-0 text-muted" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted" />}
                  </div>
                  <p className="truncate pl-4 text-[11.5px] text-foreground-muted">{view.summary ?? `${view.member.name} · #${view.member.precedence}`}</p>
                </button>
                {open ? <AgentDetail view={view} team={team} models={models} /> : null}
              </li>
            );
          })}
        </ul>

        {summary && !runActive ? (
          <div className="mt-3 rounded-md border border-border bg-background p-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground-muted">Lead&apos;s report</p>
            <p className="mt-1 whitespace-pre-wrap text-xs text-foreground">{summary.content}</p>
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-border p-2">
        {runActive ? (
          <div className="mb-2 flex items-center gap-2 rounded-md bg-background px-2 py-1.5 text-xs">
            <span className={cn("h-2 w-2 rounded-full", status === "awaiting_approval" ? "bg-amber-500" : "animate-pulse bg-emerald-500")} />
            <span className="text-foreground">{status === "awaiting_approval" ? "Waiting for your approval" : status === "cancelling" ? "Stopping…" : "Team is working"}</span>
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
          <label htmlFor="assign-task" className="mb-1 block px-0.5 text-[11px] font-medium text-foreground-muted">
            Assign a task to your team
          </label>
          <textarea
            id="assign-task"
            value={task}
            onChange={(event) => setTask(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                if (task.trim() && !runActive) start.mutate();
              }
            }}
            disabled={runActive}
            placeholder={runActive ? "The team is on a task…" : "What are we building? (⌘/Ctrl + Enter)"}
            className="h-24 w-full resize-none rounded-md border border-border bg-background p-2.5 pr-10 text-[13px] text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
          />
          <button
            type="submit"
            aria-label="Assign task"
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
