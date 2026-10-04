import { execFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

import { getConfig } from "../config/index.js";
import type { ChikaimaDatabase } from "../db/client.js";
import { badRequest, conflict, notFound } from "../errors.js";
import { CollabService, taskTitle, type TeamInput, type TeamWithMembers } from "./collabService.js";
import { GitRepo } from "./git.js";
import { getPreviewManager, type PreviewStatus } from "./preview.js";
import { CollabRepository, type CollabMessageRow, type CollabRunRow, type CollabTaskRow } from "./repository.js";
import { listFolders, normalizeTeamFolder, Workspace, type FolderListing } from "./workspace.js";

const CLONE_TIMEOUT_MS = 5 * 60_000;
const MAX_SEARCH_RESULTS = 200;
const MAX_SEARCH_FILE_BYTES = 256 * 1024;

// --- stack detection -----------------------------------------------------------

function readJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readText(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

/** A short "Next.js · TypeScript" style description of the project, from its manifest files. */
export function detectStack(root: string): string[] {
  const labels: string[] = [];
  const pkg = readJson(join(root, "package.json"));
  if (pkg) {
    const deps = { ...(pkg.dependencies as Record<string, string> | undefined), ...(pkg.devDependencies as Record<string, string> | undefined) };
    const frameworks: Array<[string, string]> = [
      ["next", "Next.js"],
      ["nuxt", "Nuxt"],
      ["@remix-run/react", "Remix"],
      ["astro", "Astro"],
      ["@sveltejs/kit", "SvelteKit"],
      ["@nestjs/core", "NestJS"],
      ["express", "Express"],
      ["fastify", "Fastify"],
      ["react", "React"],
      ["vue", "Vue"],
      ["svelte", "Svelte"],
    ];
    const framework = frameworks.find(([name]) => name in deps);
    if (framework) labels.push(framework[1]);
    labels.push("typescript" in deps || existsSync(join(root, "tsconfig.json")) ? "TypeScript" : "JavaScript");
  }
  const composer = readJson(join(root, "composer.json"));
  if (composer) {
    const require = (composer.require as Record<string, string> | undefined) ?? {};
    if ("laravel/framework" in require) labels.push("Laravel");
    else if ("symfony/framework-bundle" in require) labels.push("Symfony");
    labels.push("PHP");
  }
  const python = `${readText(join(root, "pyproject.toml"))}\n${readText(join(root, "requirements.txt"))}`.toLowerCase();
  if (python.trim()) {
    const framework = ["fastapi", "django", "flask"].find((name) => python.includes(name));
    if (framework) labels.push(framework === "fastapi" ? "FastAPI" : framework[0]!.toUpperCase() + framework.slice(1));
    labels.push("Python");
  }
  if (existsSync(join(root, "go.mod"))) labels.push("Go");
  if (existsSync(join(root, "Cargo.toml"))) labels.push("Rust");
  if (existsSync(join(root, "Gemfile"))) labels.push(readText(join(root, "Gemfile")).includes("rails") ? "Rails" : "Ruby");
  return Array.from(new Set(labels));
}

// --- task board ------------------------------------------------------------------

export type TaskColumn = "backlog" | "planned" | "in_progress" | "review" | "done";

export interface TaskStepView {
  index: number;
  assignee: number;
  instruction: string;
  /** done (kept), active (being worked on), pending, rejected (abandoned), skipped (no changes). */
  state: "done" | "active" | "pending" | "rejected" | "skipped";
}

export interface TaskView {
  id: string;
  number: number;
  key: string;
  title: string;
  description: string;
  column: TaskColumn;
  run_id: string | null;
  run_status: string | null;
  /** completed | failed | cancelled when the run has ended. */
  outcome: string | null;
  needs_approval: boolean;
  assignee_member_id: string | null;
  activity: string | null;
  steps: TaskStepView[];
  files_changed: number;
  tests: { passed: number; failed: number };
  created_at: string;
  updated_at: string;
}

/** Project key for task ids: the first letters of the project name, e.g. "SaaSKit" → SAAS. */
export function projectKey(name: string): string {
  const letters = name.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return (letters.slice(0, 4) || "TASK").padEnd(2, "X");
}

/** Where a task sits on the board, its subtasks (the lead's plan steps) and progress, derived from its run's transcript. */
export function describeTask(task: CollabTaskRow, run: CollabRunRow | undefined, messages: CollabMessageRow[], key: string): TaskView {
  const data = (message: CollabMessageRow) => message.data as Record<string, unknown>;
  const plan = [...messages].reverse().find((message) => message.kind === "plan");
  const planned = ((plan && (data(plan).steps as Array<{ assignee: number; instruction: string }>)) ?? []).map((step, index) => ({ ...step, index }));

  const resolved = new Map<number, TaskStepView["state"]>();
  for (const message of messages) {
    const step = data(message).step;
    if (typeof step !== "number") continue;
    if (message.kind === "decision" && data(message).approved === true) resolved.set(step, message.content.includes("made no changes") ? "skipped" : "done");
    if (message.kind === "system" && message.content.includes("abandoned")) resolved.set(step, "rejected");
  }
  // The latest status message says who is working now; if it says "idle", nobody is.
  const latestStatus = [...messages].reverse().find((message) => typeof data(message).activity === "string");
  const working = latestStatus && data(latestStatus).activity !== "idle" ? latestStatus : undefined;
  const activeStep = working && typeof data(working).step === "number" ? (data(working).step as number) : null;
  const live = run ? ["queued", "running", "awaiting_approval", "cancelling"].includes(run.status) : false;

  const steps: TaskStepView[] = planned.map((step) => ({
    index: step.index,
    assignee: step.assignee,
    instruction: step.instruction,
    state: resolved.get(step.index) ?? (live && step.index === activeStep ? "active" : "pending"),
  }));

  const resolvedApprovals = new Set(
    messages.filter((message) => message.kind === "approval" && data(message).status !== "pending").map((message) => String(data(message).approval_id)),
  );
  const pending = live
    ? messages.filter(
        (message) => message.kind === "approval" && data(message).status === "pending" && !resolvedApprovals.has(String(data(message).approval_id)),
      )
    : [];
  const mergePending = pending.some((message) => data(message).approval_kind === "merge");
  const keptOnBranch = !live && messages.some((message) => data(message).git === "kept");

  let column: TaskColumn = "backlog";
  if (run) {
    if (mergePending || keptOnBranch) column = "review";
    else if (live) column = plan ? "in_progress" : "planned";
    else column = "done";
  }

  const files = new Set<string>();
  for (const message of messages) {
    if (message.kind === "decision" && data(message).approved === true) for (const file of (data(message).files as string[] | undefined) ?? []) files.add(file);
  }
  const tests = { passed: 0, failed: 0 };
  for (const message of messages) {
    const isTest = (message.kind === "command" && data(message).stage === "test") || (message.kind === "review" && data(message).stage === "test");
    if (!isTest) continue;
    const passed = message.kind === "command" ? data(message).exit_code === 0 : data(message).vote === "approve";
    tests[passed ? "passed" : "failed"]++;
  }

  return {
    id: task.id,
    number: task.number,
    key: `${key}-${task.number}`,
    title: task.title,
    description: task.description,
    column,
    run_id: run?.id ?? null,
    run_status: run?.status ?? null,
    outcome: run && !live ? run.status : null,
    needs_approval: pending.length > 0,
    assignee_member_id: live ? (working?.memberId ?? null) : null,
    activity: live && working ? String(data(working).activity) : null,
    steps,
    files_changed: files.size,
    tests,
    created_at: task.createdAt,
    updated_at: run?.updatedAt ?? task.updatedAt,
  };
}

// --- service -------------------------------------------------------------------------

export interface ProjectSummary {
  team: TeamWithMembers;
  branch: string | null;
  remote: string | null;
  stack: string[];
  last_activity: string;
  runtime: PreviewStatus;
  active_run: { id: string; status: string; task: string } | null;
  open_tasks: number;
}

/** A remote we will clone. Local paths and file:// are refused so a project can't be used to copy files off the server. */
function validateRepoUrl(url: string): string {
  const trimmed = url.trim();
  const remote = /^(https?:\/\/[^\s]+|ssh:\/\/[^\s]+|git@[\w.-]+:[^\s]+)$/.test(trimmed);
  if (!remote || /^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(trimmed)) {
    throw badRequest("Enter a remote repository URL (https://… or git@host:owner/repo.git).");
  }
  return trimmed;
}

/**
 * Projects are the product's main object: a folder of code with its AI
 * team, git history, runtime and tasks. Under the hood a project is a
 * collaboration team, so every collaboration API keeps working.
 */
export class ProjectService {
  private readonly teams: CollabService;
  private readonly repo: CollabRepository;

  constructor(private readonly db: ChikaimaDatabase) {
    this.teams = new CollabService(db);
    this.repo = new CollabRepository(db);
  }

  async listProjects(userId: string): Promise<ProjectSummary[]> {
    const summaries = await Promise.all(
      this.teams.listTeams(userId).map(async (entry): Promise<ProjectSummary> => {
        const { team } = entry;
        const root = resolve(getConfig().collabRoot, team.folder);
        const exists = existsSync(root);
        const git = exists ? new GitRepo(root) : null;
        const isRepo = git?.isRepo() ?? false;
        const runs = this.repo.listRuns(team.id);
        const active = runs.find((run) => ["queued", "running", "awaiting_approval", "cancelling"].includes(run.status));
        const tasks = this.repo.listTasks(team.id);
        return {
          team: entry,
          branch: isRepo ? await git!.currentBranch().catch(() => null) : null,
          remote: isRepo ? await git!.remoteUrl() : null,
          stack: exists ? detectStack(root) : [],
          last_activity: [team.updatedAt, runs[0]?.updatedAt, tasks[0]?.updatedAt]
            .filter((value): value is string => Boolean(value))
            .sort()
            .at(-1)!,
          runtime: getPreviewManager().get(team.id).status,
          active_run: active ? { id: active.id, status: active.status, task: taskTitle(active.task) } : null,
          open_tasks: tasks.filter((task) => {
            const run = task.runId ? this.repo.getRun(task.runId) : undefined;
            return !run || ["queued", "running", "awaiting_approval", "cancelling"].includes(run.status);
          }).length,
        };
      }),
    );
    return summaries.sort((a, b) => b.last_activity.localeCompare(a.last_activity));
  }

  /** Clones a repository into a new project folder, then creates the project and its team. */
  async importProject(userId: string, input: TeamInput & { repo_url: string }): Promise<TeamWithMembers> {
    const url = validateRepoUrl(input.repo_url ?? "");
    const folder = normalizeTeamFolder(input.folder ?? "");
    const target = resolve(getConfig().collabRoot, folder);
    if (existsSync(target) && readdirSync(target).length > 0) throw conflict(`The folder "${folder}" already has files in it. Choose another folder name.`);
    const root = Workspace.open(folder).root;

    try {
      await new Promise<void>((done, fail) => {
        execFile(
          "git",
          ["-c", "protocol.file.allow=never", "-c", "protocol.ext.allow=never", "clone", "--quiet", "--", url, root],
          { timeout: CLONE_TIMEOUT_MS, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "echo" } },
          (error, _stdout, stderr) => (error ? fail(new Error(String(stderr).trim() || error.message)) : done()),
        );
      });
    } catch (error) {
      rmSync(root, { recursive: true, force: true });
      throw badRequest(`Could not clone ${url}: ${error instanceof Error ? error.message.split("\n").at(-1) : String(error)}`);
    }
    try {
      return this.teams.createTeam(userId, { ...input, folder, git_enabled: input.git_enabled ?? true });
    } catch (error) {
      rmSync(root, { recursive: true, force: true });
      throw error;
    }
  }

  /** Folders under the projects root for the folder picker, marking any that already belong to one of your projects. */
  folders(userId: string, path: string): Omit<FolderListing, "folders"> & { folders: Array<FolderListing["folders"][number] & { projectId: string | null }> } {
    const listing = listFolders(path);
    const byFolder = new Map(this.teams.listTeams(userId).map(({ team }) => [team.folder, team.id]));
    return { ...listing, folders: listing.folders.map((folder) => ({ ...folder, projectId: byFolder.get(folder.path) ?? null })) };
  }

  // --- tasks -------------------------------------------------------------------------

  listTasks(userId: string, teamId: string): TaskView[] {
    const { team } = this.teams.getTeam(userId, teamId);
    const key = projectKey(team.name);
    return this.repo.listTasks(teamId).map((task) => {
      const run = task.runId ? this.repo.getRun(task.runId) : undefined;
      return describeTask(task, run, run ? this.repo.listMessages(run.id) : [], key);
    });
  }

  createTask(userId: string, teamId: string, title: string, description: string): TaskView {
    const { team } = this.teams.getTeam(userId, teamId);
    const text = (title ?? "").trim();
    if (!text) throw badRequest("A task needs a title.");
    const task = this.repo.createTask({ teamId, userId, title: taskTitle(text), description: (description ?? "").trim() });
    return describeTask(task, undefined, [], projectKey(team.name));
  }

  /** Hands a backlog task (or a finished one, to retry it) to the team. */
  startTask(userId: string, teamId: string, taskId: string): CollabRunRow {
    this.teams.getTeam(userId, teamId);
    const task = this.repo.getTask(taskId);
    if (!task || task.teamId !== teamId) throw notFound("Task not found.");
    const current = task.runId ? this.repo.getRun(task.runId) : undefined;
    if (current && ["queued", "running", "awaiting_approval", "cancelling"].includes(current.status)) throw conflict("This task is already being worked on.");
    return this.teams.startRun(userId, teamId, [task.title, task.description].filter(Boolean).join("\n\n"), task.id);
  }

  deleteTask(userId: string, teamId: string, taskId: string): void {
    this.teams.getTeam(userId, teamId);
    const task = this.repo.getTask(taskId);
    if (!task || task.teamId !== teamId) throw notFound("Task not found.");
    if (task.runId) throw conflict("Only backlog tasks can be deleted; this one has already been worked on.");
    this.repo.deleteTask(taskId);
  }

  // --- search ------------------------------------------------------------------------

  /** Case-insensitive text search across the project's files (dependency and build folders skipped). */
  search(userId: string, teamId: string, query: string): { matches: Array<{ path: string; line: number; text: string }>; truncated: boolean } {
    const { team } = this.teams.getTeam(userId, teamId);
    const needle = (query ?? "").trim().toLowerCase();
    if (needle.length < 2) throw badRequest("Search for at least 2 characters.");
    const workspace = Workspace.open(team.folder);
    const matches: Array<{ path: string; line: number; text: string }> = [];
    for (const entry of workspace.entries().entries) {
      if (entry.type !== "file") continue;
      let content: string;
      try {
        const { absolute } = workspace.resolvePath(entry.path);
        if (readFileSync(absolute).byteLength > MAX_SEARCH_FILE_BYTES) continue;
        content = workspace.read(entry.path);
      } catch {
        continue;
      }
      const lines = content.split("\n");
      for (let index = 0; index < lines.length; index++) {
        if (!lines[index]!.toLowerCase().includes(needle)) continue;
        matches.push({ path: entry.path, line: index + 1, text: lines[index]!.trim().slice(0, 200) });
        if (matches.length >= MAX_SEARCH_RESULTS) return { matches, truncated: true };
      }
    }
    return { matches, truncated: false };
  }

  /** What a run branch changed relative to the branch it started from, for "Review changes". */
  async compare(userId: string, teamId: string, base: string, head: string) {
    const { team } = this.teams.getTeam(userId, teamId);
    const repo = new GitRepo(Workspace.open(team.folder).root);
    if (!repo.isRepo()) throw badRequest("This project is not a git repository.");
    return repo.compare(base, head);
  }
}
