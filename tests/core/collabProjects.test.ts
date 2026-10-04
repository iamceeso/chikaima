import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AuthService } from "../../core/auth/authService.js";
import { CollabService } from "../../core/collab/collabService.js";
import { GitRepo } from "../../core/collab/git.js";
import { describeTask, detectStack, ProjectService, projectKey } from "../../core/collab/projectService.js";
import { CollabRepository, type CollabMessageRow } from "../../core/collab/repository.js";
import { CollabRunner, __setCollabRunnerForTests } from "../../core/collab/runner.js";
import { Workspace } from "../../core/collab/workspace.js";
import { __resetConfigForTests } from "../../core/config/index.js";
import { __resetSecretManagerForTests } from "../../core/crypto/index.js";
import { getDb, __resetDbForTests, type ChikaimaDatabase } from "../../core/db/client.js";
import { aiModels, providers } from "../../core/db/schema.js";

async function withEnv<T>(fn: () => T | Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "chikaima-projects-"));
  const previous = { db: process.env.CHIKAIMA_DB_PATH, root: process.env.CHIKAIMA_COLLAB_ROOT };
  process.env.CHIKAIMA_DB_PATH = join(dir, "test.db");
  process.env.CHIKAIMA_COLLAB_ROOT = join(dir, "workspaces");
  __resetConfigForTests();
  __resetDbForTests();
  __resetSecretManagerForTests();
  try {
    return await fn();
  } finally {
    __setCollabRunnerForTests(null);
    __resetDbForTests();
    __resetConfigForTests();
    __resetSecretManagerForTests();
    for (const [key, value] of [["CHIKAIMA_DB_PATH", previous.db], ["CHIKAIMA_COLLAB_ROOT", previous.root]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

function seed(db: ChikaimaDatabase): string {
  const user = new AuthService(db).register({ email: "admin@example.com", fullName: "Admin", password: "password123" });
  const now = new Date().toISOString();
  db.insert(providers).values({ id: "prov-1", userId: user.id, name: "OpenAI", providerType: "openai", baseUrl: null, encryptedConfig: {}, isEnabled: true, createdAt: now, updatedAt: now }).run();
  db.insert(aiModels).values({ id: "m1", providerId: "prov-1", modelKey: "gpt", displayName: "GPT", capabilities: {}, isDefault: true, isAvailable: true, createdAt: now, updatedAt: now }).run();
  return user.id;
}

const project = (name = "SaaSKit", folder = "saaskit") => ({ name, folder, members: [{ model_id: "m1", role: "implementer", precedence: 1 }] });

test("detectStack names the framework and language from manifest files", () => {
  const dir = mkdtempSync(join(tmpdir(), "chikaima-stack-"));
  try {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { next: "16", react: "19" }, devDependencies: { typescript: "5" } }));
    assert.deepEqual(detectStack(dir), ["Next.js", "TypeScript"]);
    rmSync(join(dir, "package.json"));
    writeFileSync(join(dir, "composer.json"), JSON.stringify({ require: { "laravel/framework": "^11" } }));
    assert.deepEqual(detectStack(dir), ["Laravel", "PHP"]);
    rmSync(join(dir, "composer.json"));
    writeFileSync(join(dir, "requirements.txt"), "fastapi==0.110\nuvicorn\n");
    assert.deepEqual(detectStack(dir), ["FastAPI", "Python"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("projectKey turns a project name into a task prefix", () => {
  assert.equal(projectKey("SaaSKit"), "SAAS");
  assert.equal(projectKey("my app"), "MYAP");
  assert.equal(projectKey("Q"), "QX");
  assert.equal(projectKey("—"), "TASK");
});

test("tasks are numbered per project, start in the backlog, and only backlog tasks can be deleted", async () => {
  await withEnv(async () => {
    const db = getDb();
    const userId = seed(db);
    const service = new ProjectService(db);
    const { team } = new CollabService(db).createTeam(userId, project());
    const { team: other } = new CollabService(db).createTeam(userId, project("Other", "other"));

    const first = service.createTask(userId, team.id, "Add OAuth login", "Google and GitHub providers.");
    const second = service.createTask(userId, team.id, "Billing page", "");
    assert.deepEqual([first.key, second.key, first.column], ["SAAS-1", "SAAS-2", "backlog"]);
    assert.equal(service.createTask(userId, other.id, "Elsewhere", "").key, "OTHE-1");
    assert.throws(() => service.createTask(userId, team.id, "  ", ""), /needs a title/);

    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const runner = new CollabRunner(db, () => ({ complete: async () => (await gate, "<done/>") }));
    __setCollabRunnerForTests(runner);
    const run = service.startTask(userId, team.id, first.id);
    assert.match(run.task, /^Add OAuth login\n\nGoogle and GitHub providers\.$/);
    assert.equal(service.listTasks(userId, team.id).find((task) => task.id === first.id)!.column, "planned");
    assert.throws(() => service.startTask(userId, team.id, first.id), /already being worked on/);
    assert.throws(() => service.deleteTask(userId, team.id, first.id), /Only backlog tasks/);
    service.deleteTask(userId, team.id, second.id);

    release();
    await runner.wait(run.id);
    const done = service.listTasks(userId, team.id).find((task) => task.id === first.id)!;
    assert.deepEqual([done.column, done.outcome], ["done", "completed"]);
    assert.deepEqual(service.listTasks(userId, team.id).map((task) => task.key), ["SAAS-1"]);
  });
});

test("giving the team a task directly also records it as a task", async () => {
  await withEnv(async () => {
    const db = getDb();
    const userId = seed(db);
    const { team } = new CollabService(db).createTeam(userId, { ...project(), git_enabled: false });
    const runner = new CollabRunner(db, () => ({ complete: async () => "<done/>" }));
    __setCollabRunnerForTests(runner);
    const run = new CollabService(db).startRun(userId, team.id, "Fix the navbar\nIt overlaps the logo on mobile.");
    await runner.wait(run.id);
    const [task] = new ProjectService(db).listTasks(userId, team.id);
    assert.deepEqual([task!.key, task!.title, task!.run_id], ["SAAS-1", "Fix the navbar", run.id]);
  });
});

test("describeTask places a task on the board and tracks its subtasks", () => {
  const now = new Date().toISOString();
  const task = { id: "t", teamId: "team", userId: "u", number: 12, title: "OAuth", description: "", runId: "r", createdAt: now, updatedAt: now };
  const run = { id: "r", teamId: "team", userId: "u", task: "OAuth", status: "running", result: {}, errorMessage: null, baseBranch: "main", runBranch: "b", startedAt: now, completedAt: null, createdAt: now, updatedAt: now };
  let id = 0;
  const message = (kind: string, content: string, data: Record<string, unknown>, memberId: string | null = null): CollabMessageRow => ({ id: ++id, runId: "r", userId: "u", memberId, kind, content, data, createdAt: now });

  assert.equal(describeTask(task, run, [], "AUTH").column, "planned");

  const steps = [
    { assignee: 2, instruction: "Add provider" },
    { assignee: 2, instruction: "Add callback API" },
    { assignee: 3, instruction: "Add tests" },
  ];
  const messages = [
    message("plan", "", { steps }),
    message("decision", "Step 1 approved", { step: 0, approved: true, files: ["src/auth/provider.ts"] }),
    message("command", "ok", { stage: "test", exit_code: 0, step: 0 }),
    message("system", "Bo is working on step 2.", { activity: "coding", step: 1 }, "bo"),
  ];
  const view = describeTask(task, run, messages, "AUTH");
  assert.deepEqual([view.key, view.column, view.assignee_member_id, view.activity], ["AUTH-12", "in_progress", "bo", "coding"]);
  assert.deepEqual(view.steps.map((step) => step.state), ["done", "active", "pending"]);
  assert.deepEqual([view.files_changed, view.tests.passed], [1, 1]);

  const merging = describeTask(task, { ...run, status: "awaiting_approval" }, [...messages, message("approval", "Merge?", { approval_id: "a", approval_kind: "merge", status: "pending" })], "AUTH");
  assert.deepEqual([merging.column, merging.needs_approval], ["review", true]);
  const kept = describeTask(task, { ...run, status: "completed" }, [...messages, message("system", "Not merged.", { git: "kept" })], "AUTH");
  assert.equal(kept.column, "review");
  const failed = describeTask(task, { ...run, status: "failed" }, messages, "AUTH");
  assert.deepEqual([failed.column, failed.outcome, failed.assignee_member_id], ["done", "failed", null]);
});

test("project summaries show branch, remote, stack and open tasks", async () => {
  await withEnv(async () => {
    const db = getDb();
    const userId = seed(db);
    const { team } = new CollabService(db).createTeam(userId, project());
    const root = Workspace.open("saaskit").root;
    writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: { react: "19" } }));
    await new GitRepo(root).ensureRepo();
    execFileSync("git", ["remote", "add", "origin", "https://github.com/example/saaskit.git"], { cwd: root });
    new ProjectService(db).createTask(userId, team.id, "Backlog item", "");

    const [summary] = await new ProjectService(db).listProjects(userId);
    assert.equal(summary!.team.team.id, team.id);
    assert.ok(["master", "main"].includes(summary!.branch!));
    assert.equal(summary!.remote, "https://github.com/example/saaskit.git");
    assert.deepEqual(summary!.stack, ["React", "JavaScript"]);
    assert.deepEqual([summary!.runtime, summary!.active_run, summary!.open_tasks], ["stopped", null, 1]);
  });
});

test("importing a project refuses local paths and file URLs, and occupied folders", async () => {
  await withEnv(async () => {
    const db = getDb();
    const userId = seed(db);
    const service = new ProjectService(db);
    for (const url of ["/etc", "file:///etc", "../other", "ext::sh -c id", "http://localhost/repo.git", "https://127.0.0.1/x.git"]) {
      await assert.rejects(service.importProject(userId, { ...project(), repo_url: url }), /remote repository URL/, url);
    }
    mkdirSync(join(Workspace.open("taken").root, "src"));
    await assert.rejects(service.importProject(userId, { ...project("Taken", "taken"), repo_url: "https://github.com/example/x.git" }), /already has files/);
  });
});

test("search finds text across project files, and compare diffs a run branch against its base", async () => {
  await withEnv(async () => {
    const db = getDb();
    const userId = seed(db);
    const { team } = new CollabService(db).createTeam(userId, project());
    const root = Workspace.open("saaskit").root;
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src/auth.ts"), "export const provider = 'google';\nexport function login() {}\n");
    mkdirSync(join(root, "node_modules/x"), { recursive: true });
    writeFileSync(join(root, "node_modules/x/index.js"), "login()");
    const repo = new GitRepo(root);
    await repo.ensureRepo();
    const base = await repo.currentBranch();

    const service = new ProjectService(db);
    assert.deepEqual(service.search(userId, team.id, "LOGIN").matches, [{ path: "src/auth.ts", line: 2, text: "export function login() {}" }]);
    assert.throws(() => service.search(userId, team.id, "x"), /at least 2/);

    await repo.createBranch("chikaima/run-1");
    await repo.checkout("chikaima/run-1");
    writeFileSync(join(root, "src/auth.ts"), "export const provider = 'github';\nexport function login() {}\n");
    await repo.commitAll("Step 1: switch provider (Bo)");
    const [commit] = await repo.log(1);
    assert.deepEqual([commit!.files, commit!.additions, commit!.deletions], [1, 1, 1]);
    await repo.checkout(base);

    assert.deepEqual(await service.compare(userId, team.id, base, "chikaima/run-1"), [
      { path: "src/auth.ts", before: "export const provider = 'google';\nexport function login() {}\n", after: "export const provider = 'github';\nexport function login() {}\n" },
    ]);
    await assert.rejects(service.compare(userId, team.id, base, "nope"), /Unknown branch/);
  });
});
