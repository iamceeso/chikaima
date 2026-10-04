"use client";

import { Suspense, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, FolderPlus } from "lucide-react";

import { AUTONOMY_LABELS } from "@/components/collab/constants";
import { FolderPicker } from "@/components/collab/folder-picker";
import { AdminAccessGate } from "@/components/settings/admin-access-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminAccess } from "@/hooks/use-admin-access";
import { setLastProject } from "@/lib/last-project";
import { cn } from "@/lib/utils";
import { api, type ApiAccess } from "@/services/api";
import type { AIModel, CollabAutonomy, CollabTeamInput, CollabTemplate } from "@/types";

type Source = "blank" | "import";

const PRIMARY_PRESETS = ["solo", "fullstack"];

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function repoName(url: string): string {
  return /([^/:]+?)(\.git)?\/?$/.exec(url.trim())?.[1] ?? "";
}

function buildInput(name: string, folder: string, preset: CollabTemplate, models: AIModel[], modelId: string, mix: boolean, autonomy: CollabAutonomy): CollabTeamInput {
  const pick = (index: number) => (mix ? models[index % models.length]!.id : modelId);
  return {
    name,
    folder,
    autonomy,
    decision_policy: preset.decision_policy,
    max_revisions: 2,
    max_model_calls: 80,
    test_command: preset.test_command,
    git_enabled: true,
    parallel: false,
    preview_command: null,
    deploy_command: null,
    members: preset.members.map((seat, index) => ({ ...seat, model_id: pick(index) })),
  };
}

function NewProjectForm({ access, models }: { access: ApiAccess; models: AIModel[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const [source, setSource] = useState<Source>(params.get("source") === "import" ? "import" : "blank");
  const [name, setName] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [folder, setFolder] = useState("");
  const [presetId, setPresetId] = useState("fullstack");
  const [modelId, setModelId] = useState(models[0]?.id ?? "");
  const [mix, setMix] = useState(models.length > 1);
  const [autonomy, setAutonomy] = useState<CollabAutonomy>("semi");

  const templatesQuery = useQuery({ queryKey: ["collab-templates"], queryFn: () => api.getCollabTemplates(access) });
  const templates = useMemo(() => templatesQuery.data ?? [], [templatesQuery.data]);
  const preset = templates.find((template) => template.id === (presetId === "custom" ? "solo" : presetId));
  const projectName = name.trim() || (source === "import" ? repoName(repoUrl) : "");
  const projectFolder = folder || slug(projectName);

  const create = useMutation({
    mutationFn: async () => {
      if (!preset) throw new Error("Pick a team preset.");
      if (!projectName) throw new Error("Give the project a name.");
      const input = buildInput(projectName, projectFolder, preset, models, modelId, mix, autonomy);
      return source === "import" ? api.importProject(access, { ...input, repo_url: repoUrl }) : api.createCollabTeam(access, input);
    },
    onSuccess: async (project) => {
      setLastProject(project.id);
      await queryClient.invalidateQueries({ queryKey: ["collab-projects"] });
      await queryClient.invalidateQueries({ queryKey: ["collab-teams"] });
      router.push(presetId === "custom" ? `/projects/${project.id}/team` : `/projects/${project.id}`);
    },
  });

  return (
    <div className="mx-auto max-w-3xl pb-10">
      <h1 className="pt-4 text-2xl font-semibold tracking-tight text-foreground">New project</h1>
      <p className="mt-1 text-sm text-foreground-muted">Point Chikaima at some code, choose your AI engineering team, and decide how much you supervise.</p>

      <div className="mt-6 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Project source">
        {[
          { id: "blank" as const, icon: FolderPlus, title: "Blank or existing folder", copy: "Start empty, or open a folder of code that's already in the projects root." },
          { id: "import" as const, icon: Download, title: "Import Git repository", copy: "Clone a repository from GitHub, GitLab or any git host." },
        ].map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={source === option.id}
            onClick={() => setSource(option.id)}
            className={cn("flex gap-3 rounded-lg border p-4 text-left", source === option.id ? "border-primary bg-primary/6" : "border-border hover:border-primary/50")}
          >
            <option.icon className={cn("mt-0.5 h-4 w-4 shrink-0", source === option.id ? "text-primary" : "text-foreground-muted")} />
            <span>
              <span className="block text-sm font-medium text-foreground">{option.title}</span>
              <span className="mt-0.5 block text-xs text-foreground-muted">{option.copy}</span>
            </span>
          </button>
        ))}
      </div>

      <section className="mt-6 space-y-4">
        {source === "import" ? (
          <div>
            <Label htmlFor="repo_url">Repository URL</Label>
            <Input id="repo_url" value={repoUrl} onChange={(event) => setRepoUrl(event.target.value)} placeholder="https://github.com/acme/my-saas.git" />
            <p className="mt-1 text-xs text-foreground-muted">Public repositories work out of the box. Private ones need git credentials on the server.</p>
          </div>
        ) : null}
        <div>
          <Label htmlFor="project_name">Project name</Label>
          <Input id="project_name" value={name} onChange={(event) => setName(event.target.value)} placeholder={source === "import" ? repoName(repoUrl) || "my-saas" : "my-saas"} />
        </div>
        <div>
          <Label>Folder</Label>
          <p className="mb-1.5 text-xs text-foreground-muted">
            {source === "import" ? "The repository is cloned into a new folder." : "Pick an existing folder of code, or name a new one."}
            {!folder && projectFolder ? <> Default: <span className="font-mono">{projectFolder}</span></> : null}
          </p>
          <FolderPicker access={access} value={folder} onChange={setFolder} allowExisting={source === "blank"} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-foreground">AI engineering team</h2>
        <div className="mt-2 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Team preset">
          {[...templates.filter((template) => PRIMARY_PRESETS.includes(template.id)), { id: "custom", name: "Custom team", description: "Start small and configure every role yourself.", members: [] } as Pick<CollabTemplate, "id" | "name" | "description" | "members">].map(
            (template) => (
              <button
                key={template.id}
                type="button"
                role="radio"
                aria-checked={presetId === template.id}
                onClick={() => setPresetId(template.id)}
                className={cn("flex flex-col items-start justify-start rounded-lg border p-3 text-left", presetId === template.id ? "border-primary bg-primary/6" : "border-border hover:border-primary/50")}
              >
                <span className="block text-sm font-medium text-foreground">{template.name.replace(" Team", "")}</span>
                <span className="mt-0.5 block text-xs text-foreground-muted">{template.description}</span>
                {template.members.length ? <span className="mt-2 block text-[11px] text-muted">{template.members.map((seat) => seat.title).join(" · ")}</span> : null}
              </button>
            ),
          )}
        </div>
        {templates.some((template) => !PRIMARY_PRESETS.includes(template.id)) ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-foreground-muted">
            More presets:
            {templates
              .filter((template) => !PRIMARY_PRESETS.includes(template.id))
              .map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setPresetId(template.id)}
                  className={cn("rounded border px-2 py-0.5", presetId === template.id ? "border-primary text-foreground" : "border-border hover:text-foreground")}
                >
                  {template.name}
                </button>
              ))}
          </div>
        ) : null}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="model">Model</Label>
            <select id="model" value={modelId} onChange={(event) => setModelId(event.target.value)} disabled={mix} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm disabled:opacity-50">
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.display_name}
                  {model.provider_name ? ` · ${model.provider_name}` : ""}
                </option>
              ))}
            </select>
            {models.length > 1 ? (
              <label className="mt-2 flex items-center gap-2 text-xs text-foreground-muted">
                <input type="checkbox" checked={mix} onChange={(event) => setMix(event.target.checked)} />
                Spread agents across all {models.length} models, so they check each other with different eyes
              </label>
            ) : null}
          </div>
          <div>
            <Label>Supervision</Label>
            <div className="space-y-1.5">
              {(Object.keys(AUTONOMY_LABELS) as CollabAutonomy[]).map((level) => (
                <label key={level} className={cn("flex cursor-pointer gap-2 rounded-md border p-2", autonomy === level ? "border-primary" : "border-border")}>
                  <input type="radio" name="autonomy" checked={autonomy === level} onChange={() => setAutonomy(level)} className="mt-0.5" />
                  <span>
                    <span className="block text-[13px] font-medium text-foreground">{AUTONOMY_LABELS[level].label}</span>
                    <span className="block text-[11.5px] text-foreground-muted">{AUTONOMY_LABELS[level].hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted">Each agent&apos;s role, model, permissions and file scope can be changed later under AI Team.</p>
      </section>

      {create.error ? <p className="mt-6 text-sm text-destructive">{create.error.message}</p> : null}
      <div className="mt-6 flex items-center justify-end gap-2 border-t border-border pt-4">
        <Button asChild href="/projects" variant="ghost">
          Cancel
        </Button>
        <Button type="button" disabled={create.isPending || !projectName || (source === "import" && !repoUrl.trim())} onClick={() => create.mutate()}>
          {create.isPending ? (source === "import" ? "Cloning…" : "Creating…") : source === "import" ? "Import and open workspace" : "Create and open workspace"}
        </Button>
      </div>
    </div>
  );
}

export default function NewProjectPage() {
  const { access, hasAdminAccess, workspaceAuthDisabled } = useAdminAccess();
  const modelsQuery = useQuery({ queryKey: ["collab-models"], queryFn: () => api.getWorkspaceModels(access!), enabled: Boolean(access) });
  const models = useMemo(() => (modelsQuery.data ?? []).filter((model) => model.is_available), [modelsQuery.data]);

  if (!hasAdminAccess || !access) {
    return workspaceAuthDisabled ? (
      <AdminAccessGate title="Administrator access required" description="Projects run code and AI agents on this server, so only administrators can create them." />
    ) : (
      <p className="p-6 text-sm text-foreground-muted">Only administrators can create projects.</p>
    );
  }
  if (modelsQuery.isLoading) return <p className="p-6 text-sm text-foreground-muted">Loading…</p>;
  if (models.length === 0) {
    return (
      <div className="mx-auto max-w-xl pt-10 text-center">
        <h1 className="text-lg font-semibold text-foreground">Connect a model first</h1>
        <p className="mt-2 text-sm text-foreground-muted">Your AI engineering team runs on the models you enable. Add a provider, then enable at least one model.</p>
        <Button asChild href="/settings/providers" className="mt-4">
          Add a provider
        </Button>
      </div>
    );
  }
  return (
    <Suspense fallback={null}>
      <NewProjectForm access={access} models={models} />
    </Suspense>
  );
}
