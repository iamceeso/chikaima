"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Circle, CircleDot, Minus, Play, Plus, RotateCcw, ShieldAlert, Trash2, X } from "lucide-react";

import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";
import { api, type ApiAccess } from "@/services/api";
import type { CollabTask, CollabTaskColumn, CollabTeam } from "@/types";

const COLUMNS: Array<{ id: CollabTaskColumn; label: string }> = [
  { id: "backlog", label: "Backlog" },
  { id: "planned", label: "Planned" },
  { id: "in_progress", label: "In progress" },
  { id: "review", label: "Review" },
  { id: "done", label: "Done" },
];

const STEP_ICON = {
  done: <Check className="h-3 w-3 text-emerald-600" />,
  active: <CircleDot className="h-3 w-3 animate-pulse text-primary" />,
  pending: <Circle className="h-3 w-3 text-muted" />,
  rejected: <X className="h-3 w-3 text-red-600" />,
  skipped: <Minus className="h-3 w-3 text-muted" />,
} as const;

function TaskCard({
  task,
  team,
  busy,
  onStart,
  onDelete,
  onOpen,
}: {
  task: CollabTask;
  team: CollabTeam;
  busy: boolean;
  onStart: () => void;
  onDelete: () => void;
  onOpen: () => void;
}) {
  const assignee = team.members.find((member) => member.id === task.assignee_member_id);
  const live = task.column === "planned" || task.column === "in_progress" || (task.column === "review" && task.needs_approval);
  return (
    <div className="rounded-md border border-border bg-background p-2.5 text-xs shadow-[0_1px_0_rgba(0,0,0,0.03)]">
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[11px] text-muted">{task.key}</span>
        {task.needs_approval ? (
          <span className="ml-auto flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10.5px] font-medium text-amber-700 dark:text-amber-400">
            <ShieldAlert className="h-3 w-3" /> Needs approval
          </span>
        ) : task.outcome && task.outcome !== "completed" ? (
          <span
            className={cn(
              "ml-auto rounded px-1.5 py-0.5 text-[10.5px] font-medium",
              task.outcome === "failed" ? "bg-red-500/12 text-red-600" : "bg-surface-strong text-foreground-muted",
            )}
          >
            {task.outcome}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-[13px] font-medium leading-snug text-foreground">{task.title}</p>
      {assignee && live ? (
        <p className="mt-1 flex items-center gap-1.5 text-foreground-muted">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
          {assignee.title || assignee.name} · {task.activity}
        </p>
      ) : null}

      {task.steps.length ? (
        <ul className="mt-2 space-y-0.5">
          {task.steps.map((step) => {
            const owner = team.members.find((member) => member.precedence === step.assignee);
            return (
              <li key={step.index} className="flex items-start gap-1.5" title={owner ? `${owner.name}${owner.title ? `, ${owner.title}` : ""}` : undefined}>
                <span className="mt-0.5 shrink-0">{STEP_ICON[step.state]}</span>
                <span className={cn("line-clamp-2", step.state === "done" || step.state === "skipped" ? "text-foreground-muted" : "text-foreground")}>
                  {step.instruction}
                </span>
              </li>
            );
          })}
        </ul>
      ) : task.column === "backlog" && task.description ? (
        <p className="mt-1 line-clamp-3 text-foreground-muted">{task.description}</p>
      ) : null}

      {task.files_changed || task.tests.passed || task.tests.failed ? (
        <p className="mt-2 flex flex-wrap gap-x-2 text-[11px] text-muted">
          {task.files_changed ? <span>{task.files_changed} files changed</span> : null}
          {task.tests.passed ? <span className="text-emerald-600">{task.tests.passed} test runs passed</span> : null}
          {task.tests.failed ? <span className="text-red-600">{task.tests.failed} failed</span> : null}
        </p>
      ) : null}

      <div className="mt-2 flex items-center gap-1 border-t border-border pt-2">
        <span className="text-[10.5px] text-muted">{timeAgo(task.updated_at)}</span>
        <div className="ml-auto flex gap-1">
          {task.column === "backlog" ? (
            <>
              <button
                type="button"
                onClick={onDelete}
                className="rounded p-1 text-foreground-muted hover:bg-surface-strong hover:text-foreground"
                aria-label={`Delete ${task.key}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onStart}
                title={busy ? "The team is on another task" : undefined}
                className="flex items-center gap-1 rounded bg-primary px-2 py-0.5 text-primary-foreground disabled:opacity-40"
              >
                <Play className="h-3 w-3" /> Assign to team
              </button>
            </>
          ) : (
            <>
              {task.outcome === "failed" || task.outcome === "cancelled" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={onStart}
                  className="flex items-center gap-1 rounded border border-border px-2 py-0.5 text-foreground-muted hover:text-foreground disabled:opacity-40"
                >
                  <RotateCcw className="h-3 w-3" /> Retry
                </button>
              ) : null}
              <button type="button" onClick={onOpen} className="rounded border border-border px-2 py-0.5 text-foreground-muted hover:text-foreground">
                {task.needs_approval ? "Review" : "Activity"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Engineering tasks for the project: yours in the backlog, and the team's progress through plan, work, review and done. */
export function TaskBoard({ access, team, busy, onOpenRun }: { access: ApiAccess; team: CollabTeam; busy: boolean; onOpenRun: (runId: string) => void }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const tasksQuery = useQuery({
    queryKey: ["collab-tasks", team.id],
    queryFn: () => api.getTasks(access, team.id),
    refetchInterval: (query) => (query.state.data?.some((task) => ["planned", "in_progress"].includes(task.column) || task.needs_approval) ? 3_000 : 15_000),
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["collab-tasks", team.id] });
    await queryClient.invalidateQueries({ queryKey: ["collab-runs", team.id] });
  };
  const create = useMutation({
    mutationFn: () => api.createTask(access, team.id, { title, description }),
    onSuccess: async () => {
      setTitle("");
      setDescription("");
      setAdding(false);
      await refresh();
    },
  });
  const start = useMutation({
    mutationFn: (taskId: string) => api.startTask(access, team.id, taskId),
    onSuccess: async (run) => {
      await refresh();
      onOpenRun(run.id);
    },
  });
  const remove = useMutation({ mutationFn: (taskId: string) => api.deleteTask(access, team.id, taskId), onSuccess: refresh });
  const tasks = tasksQuery.data ?? [];
  const error = create.error ?? start.error ?? remove.error ?? tasksQuery.error;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-semibold text-foreground">Tasks</h2>
        <span className="text-xs text-muted">{tasks.length} total</span>
        {error ? <span className="truncate text-xs text-destructive">{error.message}</span> : null}
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="ml-auto flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> New task
        </button>
      </div>
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3">
        {COLUMNS.map((column) => {
          const items = tasks.filter((task) => task.column === column.id);
          return (
            <section key={column.id} className="flex min-w-60 flex-1 flex-col rounded-lg bg-surface" aria-label={column.label}>
              <header className="flex items-center gap-2 px-3 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground-muted">{column.label}</span>
                <span className="text-[11px] text-muted">{items.length}</span>
              </header>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                {column.id === "backlog" && adding ? (
                  <form
                    className="space-y-1.5 rounded-md border border-primary/50 bg-background p-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (title.trim()) create.mutate();
                    }}
                  >
                    <input
                      autoFocus
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="What needs building?"
                      className="h-7 w-full rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <textarea
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="Details, acceptance criteria, files to look at… (optional)"
                      className="h-16 w-full resize-none rounded border border-border bg-background p-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setAdding(false)}
                        className="rounded px-2 py-0.5 text-xs text-foreground-muted hover:text-foreground"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={!title.trim() || create.isPending}
                        className="rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground disabled:opacity-40"
                      >
                        Add to backlog
                      </button>
                    </div>
                  </form>
                ) : null}
                {items.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    team={team}
                    busy={busy || start.isPending}
                    onStart={() => start.mutate(task.id)}
                    onDelete={() => window.confirm(`Delete ${task.key}?`) && remove.mutate(task.id)}
                    onOpen={() => task.run_id && onOpenRun(task.run_id)}
                  />
                ))}
                {items.length === 0 && !(column.id === "backlog" && adding) ? (
                  <p className="px-1 py-2 text-[11.5px] text-muted">
                    {column.id === "backlog" ? "Add tasks here, then assign them to the team." : "Nothing here."}
                  </p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
