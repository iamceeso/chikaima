"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutTemplate, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { api, type ApiAccess } from "@/services/api";
import type {
  AIModel,
  CollabAutonomy,
  CollabDecisionPolicy,
  CollabMemberInput,
  CollabPermission,
  CollabRole,
  CollabTeam,
  CollabTeamInput,
  CollabTemplate,
} from "@/types";

import { FolderPicker } from "./folder-picker";
import { AUTONOMY_LABELS, DEFAULT_PERMISSIONS, PERMISSION_LABELS, POLICY_HINTS, ROLE_HINTS, selectClass } from "./constants";

/** Scope is edited as free text so typing commas works; it's split on save. */
type DraftMember = CollabMemberInput & { scopeText: string; permissions: CollabPermission[]; reviewed_by: number[] };
type Draft = Omit<CollabTeamInput, "members"> & { members: DraftMember[] };

function toDraftMember(member: CollabMemberInput): DraftMember {
  return {
    ...member,
    scopeText: (member.scope ?? []).join(", "),
    permissions: member.permissions?.length ? member.permissions : DEFAULT_PERMISSIONS[member.role],
    reviewed_by: member.reviewed_by ?? [],
  };
}

function blankDraft(models: AIModel[]): Draft {
  const model = (index: number) => models[index % Math.max(models.length, 1)]?.id ?? "";
  return {
    name: "",
    folder: "",
    decision_policy: "majority",
    max_revisions: 2,
    autonomy: "semi",
    test_command: null,
    max_model_calls: 80,
    git_enabled: true,
    parallel: false,
    preview_command: null,
    deploy_command: null,
    members: [
      toDraftMember({ model_id: model(0), title: "Lead Engineer", role: "lead", precedence: 1 }),
      toDraftMember({ model_id: model(1), title: "Coder", role: "implementer", precedence: 2, reports_to: 1 }),
      toDraftMember({ model_id: model(2), title: "Reviewer", role: "reviewer", precedence: 3, reports_to: 1 }),
    ],
  };
}

function fromTemplate(template: CollabTemplate, models: AIModel[], current: Draft): Draft {
  return {
    ...current,
    name: current.name || template.name,
    autonomy: template.autonomy,
    decision_policy: template.decision_policy,
    test_command: template.test_command,
    // Spread the team across the available models so agents check each other with different eyes.
    members: template.members.map((seat, index) => toDraftMember({ ...seat, model_id: models[index % models.length]?.id ?? "" })),
  };
}

function fromTeam(team: CollabTeam): Draft {
  return {
    name: team.name,
    folder: team.folder,
    decision_policy: team.decision_policy,
    max_revisions: team.max_revisions,
    autonomy: team.autonomy,
    test_command: team.test_command,
    max_model_calls: team.max_model_calls,
    git_enabled: team.git_enabled,
    parallel: team.parallel,
    preview_command: team.preview_command,
    deploy_command: team.deploy_command,
    members: team.members.map((member) =>
      toDraftMember({
        model_id: member.model_id,
        name: member.name,
        title: member.title,
        role: member.role,
        instructions: member.instructions,
        precedence: member.precedence,
        scope: member.scope,
        permissions: member.permissions,
        reports_to: member.reports_to,
        reviewed_by: member.reviewed_by,
      }),
    ),
  };
}

function toInput(draft: Draft): CollabTeamInput {
  return {
    ...draft,
    test_command: draft.test_command?.trim() || null,
    preview_command: draft.preview_command?.trim() || null,
    deploy_command: draft.deploy_command?.trim() || null,
    members: draft.members.map(({ scopeText, ...member }) => ({
      ...member,
      scope: scopeText
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    })),
  };
}

function Chip({ active, children, onClick, title }: { active: boolean; children: React.ReactNode; onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs transition-colors",
        active ? "border-primary bg-primary/12 text-foreground" : "border-border text-foreground-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Edits a project and its AI team. `section` limits what is shown: "project"
 * (name, folder, git, commands), "team" (supervision rules and agents), or
 * "all" (creating a project). `embedded` drops the card chrome for use
 * inside the workspace.
 */
export function TeamEditor({
  access,
  models,
  team,
  onDone,
  section = "all",
  embedded = false,
}: {
  access: ApiAccess;
  models: AIModel[];
  team: CollabTeam | null;
  onDone: (team: CollabTeam | null) => void;
  section?: "all" | "project" | "team";
  embedded?: boolean;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => (team ? fromTeam(team) : blankDraft(models)));
  const showProject = section !== "team";
  const showTeam = section !== "project";
  const templatesQuery = useQuery({ queryKey: ["collab-templates"], queryFn: () => api.getCollabTemplates(access), enabled: showTeam });

  const save = useMutation({
    mutationFn: () => (team ? api.updateCollabTeam(access, team.id, toInput(draft)) : api.createCollabTeam(access, toInput(draft))),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ["collab-teams"] });
      await queryClient.invalidateQueries({ queryKey: ["collab-projects"] });
      onDone(saved);
    },
  });

  const ranks = draft.members.map((member) => member.precedence).sort((a, b) => a - b);
  const byRank = (rank: number) => draft.members.find((member) => member.precedence === rank);
  const labelFor = (rank: number) => {
    const member = byRank(rank);
    return `#${rank} ${member?.name || member?.title || member?.role || ""}`.trim();
  };
  const updateMember = (index: number, patch: Partial<DraftMember>) =>
    setDraft((current) => ({ ...current, members: current.members.map((member, i) => (i === index ? { ...member, ...patch } : member)) }));
  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

  return (
    <Card className={cn("flex flex-col", embedded ? "border-0 bg-transparent p-0 shadow-none" : "rounded-xl bg-surface p-6")}>
      {/* Order: header, then (in the AI team view) the agents, then supervision settings, with presets last for an existing team. */}
      <div className="order-[-3] flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{section === "project" ? "Project settings" : section === "team" ? "AI team" : team ? `Edit ${team.name}` : "New project"}</h2>
          {section === "team" ? <p className="mt-0.5 text-sm text-foreground-muted">Who is on the team, what each agent may do, and how much you approve.</p> : null}
          {section === "project" ? <p className="mt-0.5 text-sm text-foreground-muted">Where the code lives and how the project is tested, run and deployed.</p> : null}
        </div>
        {embedded ? null : (
          <button type="button" aria-label="Close" onClick={() => onDone(null)} className="text-foreground-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {showTeam && templatesQuery.data?.length ? (
        <details className={cn("mt-4", team ? "order-1 rounded-lg border border-border px-3 py-2" : "")} open={!team}>
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            <LayoutTemplate className="h-3.5 w-3.5" /> {team ? "Replace the team with a preset…" : "Team preset"}
          </summary>
          {team ? <p className="mt-1.5 text-xs text-foreground-muted">Replaces every agent below. Nothing changes until you save.</p> : null}
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {templatesQuery.data.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => setDraft((current) => fromTemplate(template, models, current))}
                className="flex flex-col items-start rounded-lg border border-border bg-background p-3 text-left hover:border-primary"
              >
                <p className="text-sm font-semibold text-foreground">{template.name}</p>
                <p className="mt-1 text-xs text-foreground-muted">{template.description}</p>
                <p className="mt-2 text-[11px] text-muted">{template.members.map((seat) => seat.title).join(" · ")}</p>
              </button>
            ))}
          </div>
        </details>
      ) : null}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {showProject ? (
          <>
        <div>
          <Label htmlFor="team_name">Project name</Label>
          <Input id="team_name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="my-saas" />
        </div>
        {team ? (
          <div>
            <Label htmlFor="team_folder">Folder</Label>
            <Input id="team_folder" value={draft.folder} disabled />
            <p className="mt-1 text-xs text-foreground-muted">The project&apos;s code lives here as normal files.</p>
          </div>
        ) : (
          <div className="sm:col-span-2">
            <Label>Folder</Label>
            <p className="mb-1.5 text-xs text-foreground-muted">Use an existing folder of code, or create a new one.</p>
            <FolderPicker access={access} value={draft.folder} onChange={(folder) => setDraft((current) => ({ ...current, folder }))} />
          </div>
        )}
          </>
        ) : null}
        {showTeam ? (
          <>
        <div className="sm:col-span-2">
          <Label>Supervision</Label>
          <div className="mt-1 grid gap-2 sm:grid-cols-3">
            {(Object.keys(AUTONOMY_LABELS) as CollabAutonomy[]).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setDraft({ ...draft, autonomy: level })}
                className={cn("rounded-lg border p-3 text-left", draft.autonomy === level ? "border-primary bg-background" : "border-border hover:border-primary/60")}
              >
                <p className="text-sm font-semibold text-foreground">{AUTONOMY_LABELS[level].label}</p>
                <p className="mt-1 text-xs text-foreground-muted">{AUTONOMY_LABELS[level].hint}</p>
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label htmlFor="team_policy">Review decision</Label>
          <select id="team_policy" className={selectClass} value={draft.decision_policy} onChange={(event) => setDraft({ ...draft, decision_policy: event.target.value as CollabDecisionPolicy })}>
            {(Object.keys(POLICY_HINTS) as CollabDecisionPolicy[]).map((policy) => (
              <option key={policy} value={policy}>
                {policy}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-foreground-muted">{POLICY_HINTS[draft.decision_policy]}</p>
        </div>
        <div>
          <Label htmlFor="team_revisions">Revisions per step</Label>
          <Input id="team_revisions" type="number" min={0} max={5} value={draft.max_revisions} onChange={(event) => setDraft({ ...draft, max_revisions: Number.parseInt(event.target.value, 10) || 0 })} />
          <p className="mt-1 text-xs text-foreground-muted">How often a rejected step goes back before it is abandoned.</p>
        </div>
        <div>
          <Label htmlFor="team_budget">Model calls per task</Label>
          <Input id="team_budget" type="number" min={1} max={500} value={draft.max_model_calls} onChange={(event) => setDraft({ ...draft, max_model_calls: Number.parseInt(event.target.value, 10) || 1 })} />
          <p className="mt-1 text-xs text-foreground-muted">Hard stop, so agents can&apos;t turn into an expensive meeting.</p>
        </div>
          </>
        ) : null}
        {showProject ? (
          <>
        <div>
          <Label htmlFor="team_tests">Test command</Label>
          <Input id="team_tests" value={draft.test_command ?? ""} onChange={(event) => setDraft({ ...draft, test_command: event.target.value })} placeholder="npm test" />
          <p className="mt-1 text-xs text-foreground-muted">Used by agents with “Run tests”. Needs CHIKAIMA_COLLAB_EXEC on the server.</p>
        </div>
        <div>
          <Label htmlFor="team_preview">Preview command</Label>
          <Input
            id="team_preview"
            value={draft.preview_command ?? ""}
            onChange={(event) => setDraft({ ...draft, preview_command: event.target.value })}
            placeholder="npm run dev -- --port $PORT --hostname 0.0.0.0"
          />
          <p className="mt-1 text-xs text-foreground-muted">Starts the live preview. Must listen on $PORT.</p>
        </div>
        <div>
          <Label htmlFor="team_deploy">Deploy command</Label>
          <Input id="team_deploy" value={draft.deploy_command ?? ""} onChange={(event) => setDraft({ ...draft, deploy_command: event.target.value })} placeholder="vercel deploy --prod" />
          <p className="mt-1 text-xs text-foreground-muted">Run from the Deploy tab. Agents may only request it; you always approve.</p>
        </div>
        <div className="sm:col-span-2 flex flex-wrap gap-2">
          <Chip active={draft.git_enabled} onClick={() => setDraft({ ...draft, git_enabled: !draft.git_enabled, parallel: draft.git_enabled ? false : draft.parallel })}>
            Git: branch per run, commit per step
          </Chip>
          <Chip
            active={draft.parallel}
            title="Different implementers work at the same time, each in its own git worktree; merged by rank."
            onClick={() => setDraft({ ...draft, parallel: !draft.parallel, git_enabled: !draft.parallel ? true : draft.git_enabled })}
          >
            Parallel agents (git worktrees)
          </Chip>
        </div>
          </>
        ) : null}
      </div>

      <div className={cn("mt-6", !showTeam && "hidden", section === "team" && "order-[-2] mt-5")}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Agents</h3>
          <Button
            type="button"
            variant="ghost"
            className="border border-border"
            disabled={draft.members.length >= 8}
            onClick={() =>
              setDraft((current) => ({
                ...current,
                members: [...current.members, toDraftMember({ model_id: models[0]?.id ?? "", role: "reviewer", precedence: Math.max(0, ...current.members.map((m) => m.precedence)) + 1 })],
              }))
            }
          >
            <Plus className="mr-1 h-4 w-4" /> Add agent
          </Button>
        </div>
        <p className="mt-1 text-xs text-foreground-muted">Rank #1 has the final say when agents disagree. Each agent only does what its permissions and scope allow.</p>

        <div className="mt-3 space-y-3">
          {draft.members
            .map((member, index) => ({ member, index }))
            .sort((a, b) => a.member.precedence - b.member.precedence)
            .map(({ member, index }) => (
              <div key={index} className="rounded-lg border border-border bg-background p-4">
                <div className="grid gap-3 sm:grid-cols-[4.5rem_1fr_1fr_8.5rem_auto]">
                  <div>
                    <Label htmlFor={`rank_${index}`}>Rank</Label>
                    <Input id={`rank_${index}`} type="number" min={1} value={member.precedence} onChange={(event) => updateMember(index, { precedence: Number.parseInt(event.target.value, 10) || 1 })} />
                  </div>
                  <div>
                    <Label htmlFor={`title_${index}`}>Job title</Label>
                    <Input id={`title_${index}`} value={member.title ?? ""} onChange={(event) => updateMember(index, { title: event.target.value })} placeholder="Database Engineer" />
                  </div>
                  <div>
                    <Label htmlFor={`model_${index}`}>Model</Label>
                    <select id={`model_${index}`} className={selectClass} value={member.model_id} onChange={(event) => updateMember(index, { model_id: event.target.value })}>
                      {models.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.display_name}
                          {model.provider_name ? ` · ${model.provider_name}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor={`role_${index}`}>Behaviour</Label>
                    <select
                      id={`role_${index}`}
                      className={selectClass}
                      value={member.role}
                      onChange={(event) => {
                        const role = event.target.value as CollabRole;
                        updateMember(index, { role, permissions: DEFAULT_PERMISSIONS[role] });
                      }}
                    >
                      {(Object.keys(ROLE_HINTS) as CollabRole[]).map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label="Remove agent"
                      disabled={draft.members.length <= 1}
                      onClick={() => setDraft((current) => ({ ...current, members: current.members.filter((_, i) => i !== index) }))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <p className="mt-2 text-xs text-foreground-muted">{ROLE_HINTS[member.role]}</p>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-xs font-medium text-foreground">Permissions</span>
                  {(Object.keys(PERMISSION_LABELS) as CollabPermission[]).map((permission) => (
                    <Chip key={permission} active={member.permissions.includes(permission)} onClick={() => updateMember(index, { permissions: toggle(member.permissions, permission) })}>
                      {PERMISSION_LABELS[permission]}
                    </Chip>
                  ))}
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor={`scope_${index}`}>Allowed paths</Label>
                    <Input id={`scope_${index}`} value={member.scopeText} onChange={(event) => updateMember(index, { scopeText: event.target.value })} placeholder="src/frontend, **/*.test.ts (empty = whole folder)" />
                  </div>
                  <div>
                    <Label htmlFor={`reports_${index}`}>Reports to</Label>
                    <select
                      id={`reports_${index}`}
                      className={selectClass}
                      value={member.reports_to ?? ""}
                      onChange={(event) => updateMember(index, { reports_to: event.target.value ? Number.parseInt(event.target.value, 10) : null })}
                    >
                      <option value="">You (the supervisor)</option>
                      {ranks
                        .filter((rank) => rank !== member.precedence)
                        .map((rank) => (
                          <option key={rank} value={rank}>
                            {labelFor(rank)}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                {member.role === "implementer" ? (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 text-xs font-medium text-foreground">Reviewed by</span>
                    {ranks
                      .filter((rank) => rank !== member.precedence)
                      .map((rank) => (
                        <Chip key={rank} active={member.reviewed_by.includes(rank)} onClick={() => updateMember(index, { reviewed_by: toggle(member.reviewed_by, rank) })}>
                          {labelFor(rank)}
                        </Chip>
                      ))}
                    {member.reviewed_by.length === 0 ? <span className="text-xs text-muted">everyone with Review</span> : null}
                  </div>
                ) : null}

                <div className="mt-3 grid gap-3 sm:grid-cols-[12rem_1fr]">
                  <div>
                    <Label htmlFor={`name_${index}`}>Name</Label>
                    <Input id={`name_${index}`} value={member.name ?? ""} onChange={(event) => updateMember(index, { name: event.target.value })} placeholder="Bob (optional)" />
                  </div>
                  <div>
                    <Label htmlFor={`instructions_${index}`}>Instructions</Label>
                    <Textarea
                      id={`instructions_${index}`}
                      className="min-h-16"
                      value={member.instructions ?? ""}
                      onChange={(event) => updateMember(index, { instructions: event.target.value })}
                      placeholder="Prefer backwards-compatible migrations. Never remove columns without approval."
                    />
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>

      {save.error ? <p className="order-2 mt-4 text-sm text-destructive">{save.error.message}</p> : null}
      <div className="order-2 mt-5 flex justify-end gap-2">
        {embedded ? null : (
          <Button type="button" variant="ghost" className="border border-border" onClick={() => onDone(null)}>
            Cancel
          </Button>
        )}
        <Button type="button" disabled={save.isPending || models.length === 0} onClick={() => save.mutate()}>
          {save.isPending ? "Saving…" : team ? "Save changes" : "Create project"}
        </Button>
      </div>
    </Card>
  );
}
