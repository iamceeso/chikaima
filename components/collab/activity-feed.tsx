"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronRight, ShieldAlert, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { api, type ApiAccess } from "@/services/api";
import type { CollabFileChange, CollabMessage, CollabTeam } from "@/types";

import { DiffView } from "./code-editor";

function DiffBlock({ diff }: { diff: string }) {
  return (
    <pre className="mt-2 max-h-96 overflow-auto rounded-xl border border-border bg-background p-3 text-[11px] leading-relaxed">
      {diff.split("\n").map((line, index) => (
        <div
          key={index}
          className={cn(
            line.startsWith("+") && !line.startsWith("+++") && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
            line.startsWith("-") && !line.startsWith("---") && "bg-red-500/10 text-red-700 dark:text-red-300",
            line.startsWith("@@") && "text-primary",
          )}
        >
          {line || " "}
        </div>
      ))}
    </pre>
  );
}

function Expandable({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div>
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex items-center gap-1 text-left text-foreground hover:text-primary">
        <Chevron className="h-3.5 w-3.5 shrink-0" />
        {label}
      </button>
      {open ? children : null}
    </div>
  );
}

function ApprovalCard({ access, message, who }: { access: ApiAccess; message: CollabMessage; who: string }) {
  const [note, setNote] = useState("");
  const resolve = useMutation({
    mutationFn: (decision: "approve" | "reject") => api.resolveCollabApproval(access, message.run_id, String(message.data.approval_id), decision, note || undefined),
  });
  const diff = typeof message.data.diff === "string" ? message.data.diff : null;
  const detail = message.data.files_detail as CollabFileChange[] | undefined;
  const command = typeof message.data.command === "string" ? message.data.command : null;
  const commits = message.data.commits as Array<{ hash: string; subject: string }> | undefined;

  return (
    <div className="rounded-2xl border border-amber-500/50 bg-amber-500/5 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <ShieldAlert className="h-4 w-4 text-amber-600" /> {who} needs your approval
      </p>
      <p className="mt-1 text-sm text-foreground">{message.content}</p>
      {command ? <pre className="mt-2 rounded-lg bg-background p-2 font-mono text-xs">$ {command}</pre> : null}
      {commits?.length ? (
        <ul className="mt-2 space-y-0.5 font-mono text-xs">
          {commits.map((commit) => (
            <li key={commit.hash}>
              <span className="text-primary">{commit.hash}</span> {commit.subject}
            </li>
          ))}
        </ul>
      ) : null}
      {detail?.length ? <div className="mt-2"><DiffView files={detail} height={360} /></div> : diff ? <DiffBlock diff={diff} /> : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input className="h-9 min-w-[12rem] flex-1" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Note for the agent (optional)" />
        <Button type="button" variant="ghost" className="h-9 border border-border" disabled={resolve.isPending || resolve.isSuccess} onClick={() => resolve.mutate("reject")}>
          <X className="mr-1 h-3.5 w-3.5" /> Reject
        </Button>
        <Button type="button" className="h-9" disabled={resolve.isPending || resolve.isSuccess} onClick={() => resolve.mutate("approve")}>
          <Check className="mr-1 h-3.5 w-3.5" /> Approve
        </Button>
      </div>
      {resolve.error ? <p className="mt-2 text-xs text-destructive">{resolve.error.message}</p> : null}
    </div>
  );
}

/**
 * The run as an operational log: who did what, in order, with diffs, test
 * output and reviews one click away, and pending approvals pinned on top.
 */
export function ActivityFeed({ access, team, messages }: { access: ApiAccess; team: CollabTeam; messages: CollabMessage[] }) {
  const resolved = new Set(messages.filter((message) => message.kind === "approval" && message.data.status !== "pending").map((message) => String(message.data.approval_id)));
  const pending = messages.filter((message) => message.kind === "approval" && message.data.status === "pending" && !resolved.has(String(message.data.approval_id)));
  const nameOf = (memberId: string | null) => {
    const member = team.members.find((candidate) => candidate.id === memberId);
    return member ? member.name : "Chikaima";
  };

  const body = (message: CollabMessage): React.ReactNode => {
    switch (message.kind) {
      case "change": {
        const files = (message.data.files as string[] | undefined) ?? [];
        const detail = message.data.files_detail as CollabFileChange[] | undefined;
        return (
          <Expandable label={<span>Changed {files.length} file(s){message.data.worktree ? " (in its own worktree)" : ""}: <span className="font-mono text-xs">{files.join(", ")}</span></span>}>
            <div className="mt-2">{detail?.length ? <DiffView files={detail} /> : <DiffBlock diff={message.content} />}</div>
          </Expandable>
        );
      }
      case "command": {
        const exit = message.data.exit_code as number | null;
        return (
          <Expandable
            label={
              <span>
                {message.data.stage === "deploy" ? <span className="font-semibold">Deploy </span> : null}
                <span className="font-mono text-xs">$ {String(message.data.command)}</span>{" "}
                <span className={exit === 0 ? "text-emerald-600" : "text-red-600"}>{message.data.timed_out ? "timed out" : `exit ${exit}`}</span>
              </span>
            }
          >
            <pre className="mt-2 max-h-72 overflow-auto rounded-xl border border-border bg-background p-3 text-[11px]">{message.content}</pre>
          </Expandable>
        );
      }
      case "review": {
        const vote = message.data.vote as string | null;
        return (
          <span>
            <span className={cn("font-semibold", vote === "approve" ? "text-emerald-600" : vote === "reject" ? "text-red-600" : "text-foreground-muted")}>
              {message.data.stage === "test" ? (vote === "approve" ? "Tests passed" : "Tests failed") : vote === "approve" ? "Approved" : vote === "reject" ? "Found issues" : "No verdict"}
            </span>
            {message.content ? <span className="whitespace-pre-wrap text-foreground"> — {message.content}</span> : null}
          </span>
        );
      }
      case "plan": {
        const steps = (message.data.steps as Array<{ assignee: number; instruction: string }> | undefined) ?? [];
        return (
          <div>
            <span className="text-foreground">Planned {steps.length} step(s):</span>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-foreground">
              {steps.map((step, index) => {
                const assignee = team.members.find((member) => member.precedence === step.assignee);
                return (
                  <li key={index}>
                    <span className="font-medium">{assignee?.name ?? `#${step.assignee}`}</span> — {step.instruction}
                  </li>
                );
              })}
            </ol>
          </div>
        );
      }
      case "decision":
        return <span className={cn("font-medium", message.data.approved ? "text-emerald-600" : "text-red-600")}>{message.content}</span>;
      case "summary":
        return <p className="whitespace-pre-wrap rounded-xl bg-primary/8 p-3 text-foreground">{message.content}</p>;
      case "error":
        return <span className="text-destructive">{message.content}</span>;
      case "approval":
        return <span className="text-amber-700 dark:text-amber-400">{message.content}</span>;
      case "action":
        return typeof message.data.image === "string" ? (
          <Expandable label={<span className="text-foreground-muted">{message.content}</span>}>
            {/* eslint-disable-next-line @next/next/no-img-element -- inline base64 screenshot, nothing for next/image to optimise */}
            <img src={`data:image/png;base64,${message.data.image}`} alt={message.content} className="mt-2 max-h-96 rounded-lg border border-border" />
          </Expandable>
        ) : (
          <span className="text-foreground-muted">{message.content}</span>
        );
      case "system":
        return <span className="text-foreground-muted">{message.content}</span>;
      default:
        return <span className="whitespace-pre-wrap text-foreground">{message.content}</span>;
    }
  };

  return (
    <div className="space-y-3">
      {pending.map((message) => (
        <ApprovalCard key={message.id} access={access} message={message} who={nameOf(message.member_id)} />
      ))}
      <ol className="space-y-1.5">
        {messages
          .filter((message) => !(message.kind === "approval" && message.data.status === "pending"))
          .map((message) => (
            <li key={message.id} className="grid grid-cols-[3.75rem_7.5rem_1fr] gap-2 text-sm">
              <span className="pt-0.5 text-[11px] tabular-nums text-muted">{new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              <span className="truncate pt-0.5 text-xs font-semibold text-foreground">{nameOf(message.member_id)}</span>
              <div className="min-w-0 break-words text-sm">{body(message)}</div>
            </li>
          ))}
      </ol>
    </div>
  );
}
