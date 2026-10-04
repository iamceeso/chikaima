"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertCircle, AlertTriangle, GitCommitHorizontal } from "lucide-react";

import { timeAgo } from "@/lib/time";
import { api, type ApiAccess } from "@/services/api";
import type { CollabMessage, CollabTeam } from "@/types";

interface Problem {
  id: number;
  severity: "error" | "warning";
  source: string;
  text: string;
  detail?: string;
}

/**
 * What went wrong in the run, as a problems list: run errors, failed
 * commands and tests, and reviewers' rejections. (Language diagnostics from
 * a type checker or linter show up here when agents or you run them as
 * commands.)
 */
export function problemsFrom(messages: CollabMessage[], team: CollabTeam): Problem[] {
  const nameOf = (id: string | null) => team.members.find((member) => member.id === id)?.name ?? "Chikaima";
  const problems: Problem[] = [];
  for (const message of messages) {
    if (message.kind === "error") problems.push({ id: message.id, severity: "error", source: "Run", text: message.content });
    if (message.kind === "command" && message.data.exit_code !== 0) {
      problems.push({
        id: message.id,
        severity: "error",
        source: nameOf(message.member_id),
        text: `\`${String(message.data.command)}\` ${message.data.timed_out ? "timed out" : `exited with ${String(message.data.exit_code)}`}`,
        detail: message.content.split("\n").slice(-12).join("\n"),
      });
    }
    if (message.kind === "review" && message.data.vote === "reject") {
      problems.push({ id: message.id, severity: "warning", source: nameOf(message.member_id), text: message.content.split("\n")[0] ?? "", detail: message.content });
    }
    if (message.kind === "decision" && message.data.approved === false) problems.push({ id: message.id, severity: "warning", source: "Review", text: message.content });
  }
  return problems;
}

export function ProblemsView({ messages, team }: { messages: CollabMessage[]; team: CollabTeam }) {
  const problems = problemsFrom(messages, team);
  if (!problems.length) return <p className="pt-1 text-sm text-foreground-muted">No problems in this run.</p>;
  return (
    <ul className="space-y-1 pt-1 text-xs">
      {problems.map((problem) => (
        <li key={problem.id}>
          <details>
            <summary className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 hover:bg-surface-strong/50">
              {problem.severity === "error" ? <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />}
              <span className="min-w-0 flex-1 text-foreground">{problem.text}</span>
              <span className="shrink-0 text-muted">{problem.source}</span>
            </summary>
            {problem.detail ? <pre className="ml-6 mt-1 max-h-48 overflow-auto rounded bg-zinc-950 p-2 font-mono text-[11px] text-zinc-100">{problem.detail}</pre> : null}
          </details>
        </li>
      ))}
    </ul>
  );
}

/** Commits by agents and people, each attributed to its step, agent and size, with a link to its diff. */
export function GitChangesView({ access, team, onOpenCommit }: { access: ApiAccess; team: CollabTeam; onOpenCommit: (hash: string, title: string) => void }) {
  const gitQuery = useQuery({ queryKey: ["collab-git", team.id], queryFn: () => api.getCollabGit(access, team.id) });
  const git = gitQuery.data;
  if (!git) return <p className="pt-1 text-sm text-foreground-muted">Loading…</p>;
  if (!git.is_repo) return <p className="pt-1 text-sm text-foreground-muted">This project isn&apos;t a git repository yet. Its first task will create one.</p>;

  return (
    <div className="pt-1 text-xs">
      <p className="mb-2 text-foreground-muted">
        On <span className="font-mono text-foreground">{git.branch}</span> · {git.changes.length ? `${git.changes.length} uncommitted change(s)` : "working tree clean"}
        {git.branches.filter((branch) => branch.startsWith("chikaima/")).length
          ? ` · ${git.branches.filter((branch) => branch.startsWith("chikaima/")).length} run branch(es) waiting to merge`
          : ""}
      </p>
      <ul className="divide-y divide-border rounded-md border border-border">
        {git.commits.map((commit) => {
          // Agent commits read "Step 2: <instruction> (<agent name>)".
          const step = /^Step (\d+): (.*) \(([^)]+)\)$/.exec(commit.subject);
          const isMerge = commit.subject.startsWith("Merge ");
          return (
            <li key={commit.hash} className="flex items-center gap-3 px-3 py-1.5">
              <GitCommitHorizontal className="h-3.5 w-3.5 shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-foreground">{step ? step[2] : commit.subject}</p>
                <p className="truncate text-[11px] text-muted">
                  {step ? `${step[3]} · step ${step[1]}` : isMerge ? "Merge" : commit.author} · {timeAgo(commit.date)}
                </p>
              </div>
              <span className="shrink-0 font-mono text-[11px] text-muted">{commit.files} files</span>
              <span className="shrink-0 font-mono text-[11px] text-emerald-600">+{commit.additions}</span>
              <span className="shrink-0 font-mono text-[11px] text-red-600">−{commit.deletions}</span>
              <button type="button" onClick={() => onOpenCommit(commit.hash, `${commit.shortHash} ${commit.subject}`)} className="shrink-0 rounded border border-border px-2 py-0.5 text-foreground-muted hover:text-foreground">
                View diff
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
