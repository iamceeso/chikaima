import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AuthService } from "../../core/auth/authService.js";
import { effectivePermissions, inScope, isRiskyCommand, needsApproval } from "../../core/collab/capabilities.js";
import { CollabService, type TeamInput, type TeamMemberInput } from "../../core/collab/collabService.js";
import { runCommand } from "../../core/collab/commands.js";
import { CollabOrchestrator, type CollabModelClient, type OrchestratorOptions } from "../../core/collab/orchestrator.js";
import { CollabRepository } from "../../core/collab/repository.js";
import { CollabRunner, __setCollabRunnerForTests } from "../../core/collab/runner.js";
import { TEAM_TEMPLATES } from "../../core/collab/templates.js";
import { Workspace } from "../../core/collab/workspace.js";
import { __resetConfigForTests } from "../../core/config/index.js";
import { __resetSecretManagerForTests } from "../../core/crypto/index.js";
import { getDb, __resetDbForTests, type ChikaimaDatabase } from "../../core/db/client.js";
import { aiModels, providers } from "../../core/db/schema.js";
import type { ChatMessage } from "../../core/providers/types.js";

async function withCollabEnv<T>(fn: () => T | Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "chikaima-collab-caps-"));
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

function textOf(messages: ChatMessage[]): string {
  return messages.map((message) => (typeof message.content === "string" ? message.content : "")).join("\n");
}

type Responder = (prompt: string, messages: ChatMessage[]) => string;

/** Routes each call to a responder by model id, so each team seat can be scripted separately. */
function clientByModel(responders: Record<string, Responder>): CollabModelClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async complete(modelId, messages) {
      calls.push(modelId);
      const responder = responders[modelId];
      if (!responder) throw new Error(`No responder for ${modelId}`);
      return responder(textOf(messages), messages);
    },
  };
}

const PLAN_FOR = (rank: number) => `<step assignee="${rank}">Do the thing.</step>`;
const lead: Responder = (prompt) => (prompt.includes("Break the task") ? PLAN_FOR(2) : prompt.includes("The run is finished") ? "Report." : "<verdict>approve</verdict>");
const approve: Responder = () => "<verdict>approve</verdict><comments>ok</comments>";

function member(model: string, role: string, precedence: number, extra: Partial<TeamMemberInput> = {}): TeamMemberInput {
  return { model_id: model, role, precedence, ...extra };
}

async function runTeam(db: ChikaimaDatabase, userId: string, input: TeamInput, client: CollabModelClient, options: OrchestratorOptions = {}, beforeRun?: (runId: string) => void) {
  // Git behaviour has its own tests (collabGit.test.ts).
  const { team } = new CollabService(db).createTeam(userId, { git_enabled: false, ...input });
  const repo = new CollabRepository(db);
  const run = repo.createRun({ teamId: team.id, userId, task: "Task" });
  beforeRun?.(run.id);
  const finished = await new CollabOrchestrator(db, client, { approvalPollMs: 5, ...options }).execute(run.id);
  return { team, run: finished, repo, root: Workspace.open(input.folder).root };
}

// --- capability rules ----------------------------------------------------------

test("inScope matches directory prefixes and globs", () => {
  assert.equal(inScope([], "anything/at/all.ts"), true);
  assert.equal(inScope(["src/frontend"], "src/frontend/app.tsx"), true);
  assert.equal(inScope(["src/frontend"], "src/frontend-old/app.tsx"), false);
  assert.equal(inScope(["src/frontend/**"], "src/frontend/a/b.tsx"), true);
  assert.equal(inScope(["**/*.test.ts"], "src/deep/x.test.ts"), true);
  assert.equal(inScope(["**/*.test.ts"], "x.test.ts"), true);
  assert.equal(inScope(["*.md"], "docs/readme.md"), false);
  assert.equal(inScope(["tests", "*.md"], "README.md"), true);
});

test("role defaults apply only when no permissions are stored", () => {
  assert.deepEqual([...effectivePermissions("reviewer", [])].sort(), ["review", "run_tests"]);
  assert.deepEqual([...effectivePermissions("implementer", ["edit"])], ["edit"]);
});

test("needsApproval follows the autonomy level", () => {
  assert.equal(isRiskyCommand("npm install stripe"), true);
  assert.equal(isRiskyCommand("npx prisma migrate dev"), true);
  assert.equal(isRiskyCommand("git push origin main"), true);
  assert.equal(isRiskyCommand("npm run lint"), false);

  assert.equal(needsApproval("semi", { kind: "command", command: "npm run lint" }), false);
  assert.equal(needsApproval("semi", { kind: "command", command: "npm install" }), true);
  assert.equal(needsApproval("supervised", { kind: "command", command: "npm run lint" }), true);
  assert.equal(needsApproval("semi", { kind: "write", path: ".env.local" }), true);
  assert.equal(needsApproval("semi", { kind: "write", path: "db/migrations/001.sql" }), true);
  assert.equal(needsApproval("semi", { kind: "write", path: "src/app.ts" }), false);
  assert.equal(needsApproval("semi", { kind: "delete", path: "a.ts" }), false);
  assert.equal(needsApproval("supervised", { kind: "step" }), true);
  assert.equal(needsApproval("autonomous", { kind: "command", command: "rm -rf build" }), false);
});

test("runCommand captures output and exit code and strips secrets from the environment", async () => {
  const dir = mkdtempSync(join(tmpdir(), "chikaima-cmd-"));
  const previous = process.env.MY_API_KEY;
  process.env.MY_API_KEY = "sk-should-not-leak";
  try {
    const ok = await runCommand(dir, 'echo "hi"; echo "key=${MY_API_KEY:-none}"');
    assert.equal(ok.exitCode, 0);
    assert.match(ok.output, /hi\nkey=none/);
    assert.equal((await runCommand(dir, "exit 3")).exitCode, 3);
    const slow = await runCommand(dir, "sleep 5", 100);
    assert.equal(slow.timedOut, true);
  } finally {
    if (previous === undefined) delete process.env.MY_API_KEY;
    else process.env.MY_API_KEY = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- enforcement during runs -----------------------------------------------------

test("an agent cannot edit outside its scope or without the permission", async () => {
  await withCollabEnv(async () => {
    const db = getDb();
    const { userId, model } = seed(db);
    const feedback: string[] = [];
    const client = clientByModel({
      [model("lead")]: lead,
      [model("fe")]: (_prompt, messages) => {
        if (messages.length > 2) {
          feedback.push(textOf(messages.slice(-1)));
          return "<done/>";
        }
        return '<write path="server/api.ts">x</write><write path="web/page.tsx">ok\n</write><delete path="web/page.tsx"/>';
      },
    });

    const { run, root } = await runTeam(db, userId, {
      name: "T",
      folder: "site",
      members: [member(model("lead"), "lead", 1), member(model("fe"), "implementer", 2, { scope: ["web"], permissions: ["edit"] })],
    }, client);

    assert.equal(run.status, "completed");
    assert.equal(existsSync(join(root, "server/api.ts")), false);
    assert.equal(readFileSync(join(root, "web/page.tsx"), "utf8"), "ok\n");
    assert.match(feedback[0]!, /server\/api\.ts is outside your scope/);
    assert.match(feedback[0]!, /do not have the delete permission/);
  });
});

test("only the members listed in reviewed_by review an implementer's work", async () => {
  await withCollabEnv(async () => {
    const db = getDb();
    const { userId, model } = seed(db);
    const client = clientByModel({
      [model("lead")]: lead,
      [model("impl")]: () => '<write path="a.txt">a\n</write><done/>',
      [model("sec")]: approve,
      [model("other")]: () => {
        throw new Error("should not be asked to review");
      },
    });

    const { run } = await runTeam(db, userId, {
      name: "T",
      folder: "site",
      members: [
        member(model("lead"), "lead", 1),
        member(model("impl"), "implementer", 2, { reviewed_by: [3] }),
        member(model("sec"), "reviewer", 3),
        member(model("other"), "reviewer", 4),
      ],
    }, client);

    assert.equal(run.status, "completed");
    assert.deepEqual(client.calls, [model("lead"), model("impl"), model("sec"), model("lead")]);
  });
});

test("a tester can add tests and run them, and a failing test sends the step back", async () => {
  await withCollabEnv(async () => {
    const db = getDb();
    const { userId, model } = seed(db);
    let attempt = 0;
    const commands: string[] = [];
    const client = clientByModel({
      [model("lead")]: lead,
      [model("impl")]: (prompt, messages) => {
        if (messages.length === 2) attempt++;
        return `<write path="src/sum.js">${attempt === 1 ? "bug" : "fixed"}\n</write><done/>`;
      },
      [model("qa")]: (_prompt, messages) => {
        if (messages.length === 2) return '<write path="tests/sum.test.js">test\n</write><test/>';
        const result = textOf(messages.slice(-1));
        return /exit code: 0/.test(result) ? "<verdict>approve</verdict><comments>Tests pass.</comments>" : "<verdict>reject</verdict><comments>sum test fails.</comments>";
      },
    });
    const fakeRun = async (cwd: string, command: string) => {
      commands.push(command);
      const source = readFileSync(join(cwd, "src/sum.js"), "utf8");
      return { exitCode: source.includes("fixed") ? 0 : 1, output: source.includes("fixed") ? "1 passed" : "1 failed", timedOut: false };
    };

    const { run, root, repo } = await runTeam(
      db,
      userId,
      {
        name: "T",
        folder: "site",
        test_command: "npm test",
        members: [member(model("lead"), "lead", 1), member(model("impl"), "implementer", 2), member(model("qa"), "tester", 3, { scope: ["tests"] })],
      },
      client,
      { commandsEnabled: true, runCommand: fakeRun },
    );

    assert.equal(run.status, "completed");
    assert.deepEqual(commands, ["npm test", "npm test"]);
    assert.equal(readFileSync(join(root, "src/sum.js"), "utf8"), "fixed\n");
    assert.equal(readFileSync(join(root, "tests/sum.test.js"), "utf8"), "test\n");
    const step = (run.result as { steps: Array<{ status: string; revisions: number }> }).steps[0]!;
    assert.deepEqual([step.status, step.revisions], ["approved", 1]);
    assert.ok(repo.listMessages(run.id).some((message) => message.kind === "command" && message.content === "1 failed"));
  });
});

test("without tester agents, the team's test command gates the step when commands are enabled", async () => {
  await withCollabEnv(async () => {
    const db = getDb();
    const { userId, model } = seed(db);
    const client = clientByModel({ [model("lead")]: lead, [model("impl")]: () => '<write path="a.txt">a\n</write><done/>' });

    const { run, root } = await runTeam(
      db,
      userId,
      { name: "T", folder: "site", test_command: "npm test", max_revisions: 0, members: [member(model("lead"), "lead", 1), member(model("impl"), "implementer", 2)] },
      client,
      { commandsEnabled: true, runCommand: async () => ({ exitCode: 1, output: "boom", timedOut: false }) },
    );

    assert.equal((run.result as { steps: Array<{ status: string; reason: string }> }).steps[0]!.status, "rejected");
    assert.match((run.result as { steps: Array<{ reason: string }> }).steps[0]!.reason, /npm test` failed/);
    assert.equal(existsSync(join(root, "a.txt")), false);
  });
});

test("commands are refused when the server has command execution disabled", async () => {
  await withCollabEnv(async () => {
    const db = getDb();
    const { userId, model } = seed(db);
    let result = "";
    const client = clientByModel({
      [model("lead")]: lead,
      [model("impl")]: (_prompt, messages) => {
        if (messages.length === 2) return "<run>echo hi</run>";
        result = textOf(messages.slice(-1));
        return "<done/>";
      },
    });
    await runTeam(db, userId, { name: "T", folder: "site", members: [member(model("lead"), "lead", 1), member(model("impl"), "implementer", 2, { permissions: ["edit", "run_commands"] })] }, client, {
      commandsEnabled: false,
    });
    assert.match(result, /command execution is disabled/);
  });
});

// --- human approval ------------------------------------------------------------

/** Answers each pending approval as it appears, in order. */
function autoAnswer(db: ChikaimaDatabase, runId: () => string, answers: Array<{ decision: "approve" | "reject"; note?: string }>): () => void {
  const repo = new CollabRepository(db);
  const service = new CollabService(db);
  const timer = setInterval(() => {
    const pending = repo.listApprovals(runId()).find((approval) => approval.status === "pending");
    if (!pending) return;
    const answer = answers.shift() ?? { decision: "approve" };
    const run = repo.getRun(runId())!;
    service.resolveApproval(run.userId, run.id, pending.id, answer.decision, answer.note);
  }, 2);
  return () => clearInterval(timer);
}

test("supervised autonomy waits for the human on each step and treats a rejection as reviewer feedback", async () => {
  await withCollabEnv(async () => {
    const db = getDb();
    const { userId, model } = seed(db);
    const prompts: string[] = [];
    const client = clientByModel({
      [model("lead")]: lead,
      [model("impl")]: (prompt, messages) => {
        if (messages.length === 2) prompts.push(textOf(messages.slice(-1)));
        return `<write path="a.txt">${prompts.length}\n</write><done/>`;
      },
    });

    let runId = "";
    const stop = autoAnswer(db, () => runId, [{ decision: "reject", note: "Use a different value." }, { decision: "approve" }]);
    try {
      const { run, root, repo } = await runTeam(
        db,
        userId,
        { name: "T", folder: "site", autonomy: "supervised", members: [member(model("lead"), "lead", 1), member(model("impl"), "implementer", 2)] },
        client,
        {},
        (id) => (runId = id),
      );
      assert.equal(run.status, "completed");
      assert.equal(readFileSync(join(root, "a.txt"), "utf8"), "2\n");
      assert.match(prompts[1]!, /Supervisor: Use a different value\./);
      assert.deepEqual(repo.listApprovals(run.id).map((approval) => [approval.kind, approval.status]), [["step", "rejected"], ["step", "approved"]]);
    } finally {
      stop();
    }
  });
});

test("under semi-autonomy a risky command waits for approval and a declined one is not run", async () => {
  await withCollabEnv(async () => {
    const db = getDb();
    const { userId, model } = seed(db);
    const ran: string[] = [];
    let result = "";
    const client = clientByModel({
      [model("lead")]: lead,
      [model("impl")]: (_prompt, messages) => {
        if (messages.length === 2) return "<run>npm run lint</run><run>npm install left-pad</run>";
        result = textOf(messages.slice(-1));
        return "<done/>";
      },
    });

    let runId = "";
    const stop = autoAnswer(db, () => runId, [{ decision: "reject", note: "No new dependencies." }]);
    try {
      await runTeam(
        db,
        userId,
        { name: "T", folder: "site", autonomy: "semi", members: [member(model("lead"), "lead", 1), member(model("impl"), "implementer", 2, { permissions: ["edit", "run_commands"] })] },
        client,
        { commandsEnabled: true, runCommand: async (_cwd, command) => (ran.push(command), { exitCode: 0, output: "ok", timedOut: false }) },
        (id) => (runId = id),
      );
      assert.deepEqual(ran, ["npm run lint"]);
      assert.match(result, /supervisor declined: No new dependencies\./);
    } finally {
      stop();
    }
  });
});

test("cancelling while a run awaits approval stops it", async () => {
  await withCollabEnv(async () => {
    const db = getDb();
    const { userId, model } = seed(db);
    const client = clientByModel({ [model("lead")]: lead, [model("impl")]: () => '<write path="a.txt">a\n</write><done/>' });
    const repo = new CollabRepository(db);
    let runId = "";
    const timer = setInterval(() => {
      if (runId && repo.getRun(runId)?.status === "awaiting_approval") repo.requestCancel(runId);
    }, 2);
    try {
      const { run, root } = await runTeam(
        db,
        userId,
        { name: "T", folder: "site", autonomy: "supervised", members: [member(model("lead"), "lead", 1), member(model("impl"), "implementer", 2)] },
        client,
        {},
        (id) => (runId = id),
      );
      assert.equal(run.status, "cancelled");
      assert.equal(existsSync(join(root, "a.txt")), false);
    } finally {
      clearInterval(timer);
    }
  });
});

// --- limits ----------------------------------------------------------------------

test("a run stops when it reaches its model-call budget", async () => {
  await withCollabEnv(async () => {
    const db = getDb();
    const { userId, model } = seed(db);
    // An implementer that never says done would loop; the budget ends it.
    const client = clientByModel({ [model("lead")]: lead, [model("impl")]: () => '<read path="."/>' });
    const { run } = await runTeam(db, userId, { name: "T", folder: "site", max_model_calls: 4, members: [member(model("lead"), "lead", 1), member(model("impl"), "implementer", 2)] }, client);
    assert.equal(run.status, "failed");
    assert.match(run.errorMessage ?? "", /limit of 4 model calls/);
    assert.equal(client.calls.length, 4);
  });
});

// --- service -----------------------------------------------------------------------

test("team validation checks reporting lines, reviewers, permissions and scope", async () => {
  await withCollabEnv(() => {
    const db = getDb();
    const { userId, model } = seed(db);
    const service = new CollabService(db);
    const impl = (extra: Partial<TeamMemberInput>) => ({ name: "T", folder: "site", members: [member(model("a"), "implementer", 1, extra), member(model("b"), "reviewer", 2)] });

    assert.throws(() => service.createTeam(userId, impl({ reports_to: 9 })), /reports to #9/);
    assert.throws(() => service.createTeam(userId, impl({ reports_to: 1 })), /reports to #1/);
    assert.throws(() => service.createTeam(userId, impl({ reviewed_by: [1] })), /reviewed by #1/);
    assert.throws(() => service.createTeam(userId, impl({ permissions: ["teleport"] })), /Unknown permission/);
    assert.throws(() => service.createTeam(userId, impl({ scope: ["../etc"] })), /inside the team folder/);
    assert.throws(() => service.createTeam(userId, { ...impl({}), autonomy: "yolo" }), /autonomy/);
    assert.throws(() => service.createTeam(userId, { ...impl({}), max_model_calls: 0 }), /max_model_calls/);

    const { team, members } = service.createTeam(userId, { ...impl({ title: "Backend Engineer", reports_to: 2, reviewed_by: [2], scope: ["src/api"] }), test_command: "  npm test " });
    assert.equal(team.testCommand, "npm test");
    assert.deepEqual([members[0]!.name, members[0]!.reportsTo, members[0]!.reviewedBy, members[0]!.scope], ["Backend Engineer", 2, [2], ["src/api"]]);
  });
});

test("every built-in template makes a valid team", async () => {
  await withCollabEnv(() => {
    const db = getDb();
    const { userId, model } = seed(db);
    const service = new CollabService(db);
    for (const template of TEAM_TEMPLATES) {
      const { members } = service.createTeam(userId, {
        name: template.name,
        folder: template.id,
        autonomy: template.autonomy,
        decision_policy: template.decision_policy,
        test_command: template.test_command,
        members: template.members.map((seat) => ({ ...seat, model_id: model("m") })),
      });
      assert.equal(members.length, template.members.length, template.id);
    }
  });
});

test("people can browse and edit the team folder, but not while agents are working in it", async () => {
  await withCollabEnv(async () => {
    const db = getDb();
    const { userId, model } = seed(db);
    const service = new CollabService(db);
    const { team } = service.createTeam(userId, { name: "T", folder: "site", members: [member(model("a"), "implementer", 1)] });
    writeFileSync(join(Workspace.open("site").root, "index.html"), "<h1>hi</h1>\n");

    assert.deepEqual(service.listFiles(userId, team.id).entries, [{ path: "index.html", type: "file" }]);
    assert.equal(service.readFile(userId, team.id, "index.html").content, "<h1>hi</h1>\n");
    service.writeFile(userId, team.id, "src/app.js", "console.log(1);\n");
    assert.deepEqual(service.listFiles(userId, team.id).entries.map((entry) => entry.path), ["index.html", "src", "src/app.js"]);
    assert.throws(() => service.readFile(userId, team.id, "../../etc/passwd"), /escapes the workspace/);

    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const runner = new CollabRunner(db, () => ({ complete: async () => (await gate, "<done/>") }));
    __setCollabRunnerForTests(runner);
    const run = service.startRun(userId, team.id, "Task");
    assert.throws(() => service.writeFile(userId, team.id, "index.html", "x"), /Agents are working/);
    release();
    await runner.wait(run.id);
  });
});
