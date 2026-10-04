import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AuthService } from "../../core/auth/authService.js";
import { CollabService, type TeamInput, type TeamMemberInput } from "../../core/collab/collabService.js";
import { GitRepo } from "../../core/collab/git.js";
import { CollabOrchestrator, type CollabModelClient } from "../../core/collab/orchestrator.js";
import { browsePreview, getPreviewManager, previewUrl } from "../../core/collab/preview.js";
import { parseAgentTurn } from "../../core/collab/protocol.js";
import { CollabRepository } from "../../core/collab/repository.js";
import { DockerExecutor, HostExecutor } from "../../core/collab/sandbox.js";
import { Workspace } from "../../core/collab/workspace.js";
import { CollabWorkspaceService } from "../../core/collab/workspaceService.js";
import { __resetConfigForTests } from "../../core/config/index.js";
import { __resetSecretManagerForTests } from "../../core/crypto/index.js";
import { getDb, __resetDbForTests, type ChikaimaDatabase } from "../../core/db/client.js";
import { aiModels, providers } from "../../core/db/schema.js";
import type { ChatMessage } from "../../core/providers/types.js";

async function withEnv<T>(fn: () => T | Promise<T>, extraEnv: Record<string, string> = {}): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "chikaima-collab-git-"));
  const env = { CHIKAIMA_DB_PATH: join(dir, "test.db"), CHIKAIMA_COLLAB_ROOT: join(dir, "workspaces"), ...extraEnv };
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  __resetConfigForTests();
  __resetDbForTests();
  __resetSecretManagerForTests();
  try {
    return await fn();
  } finally {
    __resetDbForTests();
    __resetConfigForTests();
    __resetSecretManagerForTests();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

function seed(db: ChikaimaDatabase): { userId: string; model: (key: string) => string } {
  const user = new AuthService(db).register({ email: "admin@example.com", fullName: "Admin", password: "password123" });
  const now = new Date().toISOString();
  db.insert(providers).values({ id: "prov-1", userId: user.id, name: "OpenAI", providerType: "openai", baseUrl: null, encryptedConfig: {}, isEnabled: true, createdAt: now, updatedAt: now }).run();
  const made = new Set<string>();
  return {
    userId: user.id,
    model: (key) => {
      const id = `model-${key}`;
      if (!made.has(id)) {
        db.insert(aiModels).values({ id, providerId: "prov-1", modelKey: key, displayName: key, capabilities: {}, isDefault: false, isAvailable: true, createdAt: now, updatedAt: now }).run();
        made.add(id);
      }
      return id;
    },
  };
}

const textOf = (messages: ChatMessage[]) => messages.map((message) => (typeof message.content === "string" ? message.content : "")).join("\n");
type Responder = (prompt: string, messages: ChatMessage[]) => string;
const clientByModel = (responders: Record<string, Responder>): CollabModelClient => ({
  complete: async (modelId, messages) => responders[modelId]!(textOf(messages), messages),
});
const member = (model: string, role: string, precedence: number, extra: Partial<TeamMemberInput> = {}): TeamMemberInput => ({ model_id: model, role, precedence, ...extra });
const approve: Responder = () => "<verdict>approve</verdict>";
const gitLines = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim().split("\n").filter(Boolean);

/** Answers pending approvals in order (default approve) while a run is in flight. */
function answering(db: ChikaimaDatabase, runId: () => string, answers: Array<"approve" | "reject"> = []): () => void {
  const repo = new CollabRepository(db);
  const timer = setInterval(() => {
    if (!runId()) return;
    const pending = repo.listApprovals(runId()).find((approval) => approval.status === "pending");
    if (pending) repo.resolveApproval(pending.id, (answers.shift() ?? "approve") === "approve" ? "approved" : "rejected", null);
  }, 2);
  return () => clearInterval(timer);
}

async function run(db: ChikaimaDatabase, userId: string, input: TeamInput, client: CollabModelClient, answers: Array<"approve" | "reject"> = []) {
  const { team } = new CollabService(db).createTeam(userId, input);
  const repo = new CollabRepository(db);
  const created = repo.createRun({ teamId: team.id, userId, task: "Task" });
  const stop = answering(db, () => created.id, answers);
  try {
    const finished = await new CollabOrchestrator(db, client, { approvalPollMs: 2, commandsEnabled: false }).execute(created.id);
    return { team, run: finished, repo, root: Workspace.open(input.folder).root };
  } finally {
    stop();
  }
}

// --- git -----------------------------------------------------------------------

test("a run turns the folder into a repo, commits each step on its own branch, and merges once approved", async () => {
  await withEnv(async () => {
    const db = getDb();
    const { userId, model } = seed(db);
    writeFileSync(join(Workspace.open("site").root, "README.md"), "hello\n");
    let step = 0;
    const client = clientByModel({
      [model("lead")]: (prompt) =>
        prompt.includes("Break the task") ? '<step assignee="2">One</step><step assignee="2">Two</step>' : prompt.includes("The run is finished") ? "Report." : "<verdict>approve</verdict>",
      [model("impl")]: (_prompt, messages) => (messages.length === 2 ? `<write path="step${++step}.txt">${step}\n</write><done/>` : "<done/>"),
    });

    const { run: finished, root } = await run(db, userId, { name: "T", folder: "site", members: [member(model("lead"), "lead", 1), member(model("impl"), "implementer", 2)] }, client);

    assert.equal(finished.status, "completed");
    assert.equal(finished.baseBranch, "master" === gitLines(root, "rev-parse", "--abbrev-ref", "HEAD")[0] ? "master" : finished.baseBranch);
    assert.equal(gitLines(root, "rev-parse", "--abbrev-ref", "HEAD")[0], finished.baseBranch);
    const subjects = gitLines(root, "log", "--format=%s");
    assert.match(subjects[0]!, /^Merge chikaima\/run-/);
    assert.ok(subjects.some((subject) => subject.startsWith("Step 1: One")));
    assert.ok(subjects.some((subject) => subject.startsWith("Step 2: Two")));
    assert.ok(subjects.includes("Initial snapshot (Chikaima)"));
    assert.equal(readFileSync(join(root, ".gitignore"), "utf8").includes("node_modules/"), true);
    assert.deepEqual(gitLines(root, "branch", "--format=%(refname:short)"), [finished.baseBranch]);
  });
});

test("when the supervisor declines the merge, the work stays on the run branch and the folder returns to its branch", async () => {
  await withEnv(async () => {
    const db = getDb();
    const { userId, model } = seed(db);
    const client = clientByModel({
      [model("lead")]: (prompt) => (prompt.includes("Break the task") ? '<step assignee="2">One</step>' : prompt.includes("The run is finished") ? "Report." : "<verdict>approve</verdict>"),
      [model("impl")]: () => '<write path="a.txt">a\n</write><done/>',
    });
    const { run: finished, root } = await run(db, userId, { name: "T", folder: "site", members: [member(model("lead"), "lead", 1), member(model("impl"), "implementer", 2)] }, client, ["reject"]);

    assert.equal(finished.status, "completed");
    assert.equal(existsSync(join(root, "a.txt")), false);
    assert.equal(gitLines(root, "show", `${finished.runBranch}:a.txt`)[0], "a");
  });
});

test("a run refuses to start on a folder with uncommitted changes and leaves them untouched", async () => {
  await withEnv(async () => {
    const db = getDb();
    const { userId, model } = seed(db);
    const root = Workspace.open("site").root;
    writeFileSync(join(root, "a.txt"), "committed\n");
    await new GitRepo(root).ensureRepo();
    writeFileSync(join(root, "a.txt"), "my unsaved work\n");

    const client = clientByModel({ [model("impl")]: () => "<done/>" });
    const { run: finished } = await run(db, userId, { name: "T", folder: "site", members: [member(model("impl"), "implementer", 1)] }, client);

    assert.equal(finished.status, "failed");
    assert.match(finished.errorMessage ?? "", /uncommitted changes/);
    assert.equal(readFileSync(join(root, "a.txt"), "utf8"), "my unsaved work\n");
  });
});

test("a rejected step is fully discarded with git, including files the agent's commands created", async () => {
  await withEnv(async () => {
    const db = getDb();
    const { userId, model } = seed(db);
    const client = clientByModel({
      [model("impl")]: () => {
        // Simulate a command side effect the tracked changeset knows nothing about.
        writeFileSync(join(Workspace.open("site").root, "generated.lock"), "x");
        return '<write path="a.txt">a\n</write><done/>';
      },
      [model("rev")]: () => "<verdict>reject</verdict><comments>no</comments>",
    });
    const { run: finished, root } = await run(
      db,
      userId,
      { name: "T", folder: "site", autonomy: "autonomous", max_revisions: 0, members: [member(model("impl"), "implementer", 1), member(model("rev"), "reviewer", 2)] },
      client,
    );
    assert.equal(finished.status, "completed");
    assert.equal(existsSync(join(root, "a.txt")), false);
    assert.equal(existsSync(join(root, "generated.lock")), false);
  });
});

test("parallel mode runs different implementers in separate worktrees and merges them in precedence order", async () => {
  await withEnv(async () => {
    const db = getDb();
    const { userId, model } = seed(db);
    const started: string[] = [];
    let release!: () => void;
    const bothStarted = new Promise<void>((resolve) => (release = resolve));
    const worker = (file: string): Responder => (_prompt, messages) => {
      if (messages.length !== 2) return "<done/>";
      started.push(file);
      if (started.length === 2) release();
      return `<write path="${file}">${file}\n</write><done/>`;
    };
    const slowClient: CollabModelClient = {
      async complete(modelId, messages) {
        const prompt = textOf(messages);
        if (modelId === model("lead")) {
          return prompt.includes("Break the task") ? '<step assignee="2">Frontend</step><step assignee="3">Backend</step>' : prompt.includes("The run is finished") ? "Report." : "<verdict>approve</verdict>";
        }
        const reply = (modelId === model("fe") ? worker("web.txt") : worker("api.txt"))(prompt, messages);
        // Each implementer waits until the other has started: only possible if they truly run at once.
        if (messages.length === 2) await Promise.race([bothStarted, new Promise((_, reject) => setTimeout(() => reject(new Error("steps did not run in parallel")), 5_000))]);
        return reply;
      },
    };

    const { team } = new CollabService(db).createTeam(userId, {
      name: "T",
      folder: "site",
      autonomy: "autonomous",
      parallel: true,
      members: [member(model("lead"), "lead", 1), member(model("fe"), "implementer", 2), member(model("be"), "implementer", 3)],
    });
    const repo = new CollabRepository(db);
    const created = repo.createRun({ teamId: team.id, userId, task: "Task" });
    const finished = await new CollabOrchestrator(db, slowClient, { commandsEnabled: false }).execute(created.id);
    const root = Workspace.open("site").root;

    assert.equal(finished.status, "completed", finished.errorMessage ?? "");
    assert.equal(readFileSync(join(root, "web.txt"), "utf8"), "web.txt\n");
    assert.equal(readFileSync(join(root, "api.txt"), "utf8"), "api.txt\n");
    const subjects = gitLines(root, "log", "--format=%s");
    assert.ok(subjects.indexOf("Merge step 1 (fe)") > subjects.indexOf("Merge step 2 (be)"), "step 1 (#2) merges before step 2 (#3)");
    assert.equal(gitLines(root, "worktree", "list").length, 1, "worktrees are cleaned up");
  });
});

test("parallel steps that conflict: the lower-ranked one is redone on the merged code", async () => {
  await withEnv(async () => {
    const db = getDb();
    const { userId, model } = seed(db);
    const attempts: Record<string, number> = {};
    const client = clientByModel({
      [model("lead")]: (prompt) =>
        prompt.includes("Break the task") ? '<step assignee="2">A</step><step assignee="3">B</step>' : prompt.includes("The run is finished") ? "Report." : "<verdict>approve</verdict>",
      [model("hi")]: (_p, messages) => (messages.length === 2 ? '<write path="shared.txt">from #2\n</write><done/>' : "<done/>"),
      [model("lo")]: (_prompt, messages) => {
        if (messages.length !== 2) return "<done/>";
        attempts.lo = (attempts.lo ?? 0) + 1;
        // Like a real agent reading the file first: on the redo, #2's merged version is in the folder.
        const shared = join(Workspace.open("site").root, "shared.txt");
        const merged = existsSync(shared) && readFileSync(shared, "utf8").includes("from #2");
        return merged ? '<write path="shared.txt">from #2\nand #3\n</write><done/>' : '<write path="shared.txt">from #3\n</write><done/>';
      },
    });
    const { run: finished, root, repo } = await run(
      db,
      userId,
      { name: "T", folder: "site", autonomy: "autonomous", parallel: true, members: [member(model("lead"), "lead", 1), member(model("hi"), "implementer", 2), member(model("lo"), "implementer", 3)] },
      client,
    );
    assert.equal(finished.status, "completed", finished.errorMessage ?? "");
    assert.equal(attempts.lo, 2);
    assert.equal(readFileSync(join(root, "shared.txt"), "utf8"), "from #2\nand #3\n");
    assert.ok(repo.listMessages(finished.id).some((message) => (message.data as Record<string, unknown>).git === "conflict"));
  });
});

test("parallel mode requires git", async () => {
  await withEnv(() => {
    const db = getDb();
    const { userId, model } = seed(db);
    assert.throws(() => new CollabService(db).createTeam(userId, { name: "T", folder: "site", git_enabled: false, parallel: true, members: [member(model("a"), "implementer", 1)] }), /Parallel work needs git/);
  });
});

test("the Git panel service shows status and history, commits as the user, and lists a commit's files", async () => {
  await withEnv(async () => {
    const db = getDb();
    const { userId, model } = seed(db);
    const { team } = new CollabService(db).createTeam(userId, { name: "T", folder: "site", members: [member(model("a"), "implementer", 1)] });
    const service = new CollabWorkspaceService(db);
    assert.equal((await service.gitOverview(userId, team.id)).is_repo, false);

    const root = Workspace.open("site").root;
    writeFileSync(join(root, "a.txt"), "one\n");
    await service.gitInit(userId, team.id);
    writeFileSync(join(root, "a.txt"), "two\n");
    const overview = await service.gitOverview(userId, team.id);
    assert.deepEqual(overview.changes, [{ code: " M", path: "a.txt" }]);

    const hash = await service.gitCommit(userId, team.id, "Edit a");
    const files = await service.gitCommitFiles(userId, team.id, hash);
    assert.deepEqual(files, [{ path: "a.txt", before: "one\n", after: "two\n" }]);
    await assert.rejects(service.gitCommit(userId, team.id, "nothing"), /nothing to commit/);
    await assert.rejects(service.gitCommitFiles(userId, team.id, "--help"), /Invalid commit hash/);
  });
});

// --- tools -----------------------------------------------------------------------

test("parseAgentTurn reads browse, screenshot and deploy tags", () => {
  assert.deepEqual(parseAgentTurn('<browse path="/pricing"/><screenshot path="/"/><deploy/>').actions, [
    { type: "browse", path: "/pricing" },
    { type: "screenshot", path: "/" },
    { type: "deploy" },
  ]);
});

test("browsePreview returns a page's title and visible text", async () => {
  const server = createServer((_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end("<html><head><title>Pricing</title><style>.x{}</style></head><body><h1>Plans</h1><script>evil()</script><p>Pro &amp; Team</p></body></html>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = (server.address() as { port: number }).port;
    const page = await browsePreview(port, "/pricing");
    assert.match(page, /^HTTP 200 · Pricing/);
    assert.match(page, /Plans\nPro & Team/);
    assert.doesNotMatch(page, /evil/);
    // A protocol-relative path can't redirect the request to another host: it stays a path on the preview.
    assert.equal(previewUrl(port, "//evil.example.com/"), `http://127.0.0.1:${port}/evil.example.com/`);
    assert.throws(() => previewUrl(port, "/a b"), /plain path/);
  } finally {
    server.close();
  }
});

test("the terminal runs commands in the folder through the host executor and is refused while agents work", async () => {
  await withEnv(
    async () => {
      const db = getDb();
      const { userId, model } = seed(db);
      const { team } = new CollabService(db).createTeam(userId, { name: "T", folder: "site", members: [member(model("a"), "implementer", 1)] });
      const service = new CollabWorkspaceService(db);
      let streamed = "";
      const result = await service.runTerminal(userId, team.id, "pwd && echo hi", { onOutput: (chunk) => (streamed += chunk) });
      assert.equal(result.exitCode, 0);
      assert.match(streamed, /site\nhi/);

      const repo = new CollabRepository(db);
      const active = repo.createRun({ teamId: team.id, userId, task: "x" });
      await assert.rejects(service.runTerminal(userId, team.id, "ls", { onOutput: () => {} }), /Agents are working/);
      repo.updateRun(active.id, { status: "completed" });
    },
    { CHIKAIMA_COLLAB_EXEC: "host" },
  );
});

test("the terminal explains how to enable commands when execution is off", async () => {
  await withEnv(async () => {
    const db = getDb();
    const { userId, model } = seed(db);
    const { team } = new CollabService(db).createTeam(userId, { name: "T", folder: "site", members: [member(model("a"), "implementer", 1)] });
    await assert.rejects(new CollabWorkspaceService(db).runTerminal(userId, team.id, "ls", { onOutput: () => {} }), /CHIKAIMA_COLLAB_EXEC/);
  });
});

test("the preview manager starts the team's dev server on an assigned port and stops it", async () => {
  await withEnv(
    async () => {
      const db = getDb();
      const { userId, model } = seed(db);
      const { team } = new CollabService(db).createTeam(userId, {
        name: "T",
        folder: "site",
        preview_command: `node -e "require('http').createServer((q,s)=>s.end('<title>Live</title>ok')).listen(process.env.PORT,()=>console.log('ready on '+process.env.PORT))"`,
        members: [member(model("a"), "implementer", 1)],
      });
      const service = new CollabWorkspaceService(db);
      const started = await service.startPreview(userId, team.id);
      assert.ok(started.port && started.port >= 4100 && started.port <= 4199);

      const deadline = Date.now() + 10_000;
      while (service.previewInfo(userId, team.id).status !== "running" && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
      for (let i = 0; i < 50 && !(await browsePreview(started.port!, "/")).startsWith("HTTP 200"); i++) await new Promise((resolve) => setTimeout(resolve, 100));
      assert.match(await browsePreview(started.port!, "/"), /^HTTP 200 · Live/);
      assert.match(service.previewInfo(userId, team.id).logs, /ready on/);

      await service.stopPreview(userId, team.id);
      assert.equal(service.previewInfo(userId, team.id).status, "stopped");
    },
    { CHIKAIMA_COLLAB_EXEC: "host", CHIKAIMA_COLLAB_PREVIEW_PORT_START: "4100", CHIKAIMA_COLLAB_PREVIEW_PORT_END: "4199" },
  );
  await getPreviewManager().stop("cleanup");
});

test("executors map folder paths into the project container and refuse paths outside it", async () => {
  await withEnv(() => {
    const root = Workspace.open("site").root;
    const executor = new DockerExecutor("team-123", root);
    assert.equal(executor.container, "chikaima-ws-team123");
    assert.equal(executor.containerPath(root), "/workspace");
    assert.equal(executor.containerPath(join(root, "src")), "/workspace/src");
    assert.throws(() => executor.containerPath("/etc"), /inside the team folder/);
    assert.equal(new HostExecutor("t").kind, "host");
  });
});
