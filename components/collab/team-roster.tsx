"use client";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { CollabMessage, CollabTeam } from "@/types";

const ACTIVITY_STYLE: Record<string, string> = {
  planning: "bg-sky-500",
  coding: "bg-emerald-500",
  reviewing: "bg-amber-500",
  testing: "bg-violet-500",
  waiting: "bg-red-500",
  summarizing: "bg-sky-500",
};

/**
 * The team and what each agent is doing. Agents take turns, so the one in
 * the latest status message is the active one and everyone else is idle.
 */
export function TeamRoster({ team, messages, runActive }: { team: CollabTeam; messages: CollabMessage[]; runActive: boolean }) {
  const latest = runActive ? [...messages].reverse().find((message) => typeof message.data.activity === "string" && message.member_id) : undefined;
  const edits = new Map<string, number>();
  for (const message of messages) {
    if (message.kind === "action" && message.member_id) edits.set(message.member_id, (edits.get(message.member_id) ?? 0) + 1);
  }

  return (
    <Card className="rounded-[1.25rem] bg-surface p-3">
      <span className="px-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">Team</span>
      <ul className="mt-2 space-y-1.5">
        {team.members.map((member) => {
          const activity = latest?.member_id === member.id ? String(latest.data.activity) : null;
          const boss = member.reports_to ? team.members.find((other) => other.precedence === member.reports_to) : undefined;
          return (
            <li key={member.id} className="rounded-xl bg-background px-3 py-2">
              <div className="flex items-center gap-2">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", activity ? `${ACTIVITY_STYLE[activity] ?? "bg-primary"} animate-pulse` : "bg-border")} />
                <span className="min-w-0 truncate text-xs font-semibold text-foreground">
                  #{member.precedence} {member.name}
                </span>
                <span className="ml-auto shrink-0 text-[11px] text-foreground-muted">{activity ?? "idle"}</span>
              </div>
              <p className="mt-0.5 truncate pl-4 text-[11px] text-foreground-muted">
                {member.title || member.role}
                {boss ? ` · reports to #${boss.precedence}` : ""}
                {edits.get(member.id) ? ` · ${edits.get(member.id)} edit(s)` : ""}
              </p>
              {member.scope.length > 0 ? <p className="truncate pl-4 font-mono text-[10px] text-muted">{member.scope.join(", ")}</p> : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
