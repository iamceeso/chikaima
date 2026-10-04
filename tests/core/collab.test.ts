import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AuthService } from "../../core/auth/authService.js";
import { CollabService } from "../../core/collab/collabService.js";
import { CollabOrchestrator, decide, type CollabModelClient } from "../../core/collab/orchestrator.js";
import { parseAgentTurn, parsePlan, parseVerdict } from "../../core/collab/protocol.js";
import { CollabRepository } from "../../core/collab/repository.js";
import { CollabRunner, __setCollabRunnerForTests } from "../../core/collab/runner.js";
import { normalizeTeamFolder, unifiedDiff, Workspace } from "../../core/collab/workspace.js";
import { __resetConfigForTests } from "../../core/config/index.js";
import { __resetSecretManagerForTests } from "../../core/crypto/index.js";
import { getDb, __resetDbForTests, type ChikaimaDatabase } from "../../core/db/client.js";
import { aiModels, providers } from "../../core/db/schema.js";
import { HttpError } from "../../core/errors.js";
import type { ChatMessage } from "../../core/providers/types.js";

async function withCollabEnv<T>(fn: (collabRoot: string) => T | Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "chikaima-collab-"));
  const collabRoot = join(dir, "workspaces");
  const previous = { db: process.env.CHIKAIMA_DB_PATH, root: process.env.CHIKAIMA_COLLAB_ROOT };
  process.env.CHIKAIMA_DB_PATH = join(dir, "test.db");
  process.env.CHIKAIMA_COLLAB_ROOT = collabRoot;
  __resetConfigForTests();
  __resetDbForTests();
  __resetSecretManagerForTests();
  try {
    return await fn(collabRoot);
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

function seedModels(db: ChikaimaDatabase, userId: string, keys: string[]): string[] {
  const now = new Date().toISOString();
  db.insert(providers).values({ id: "prov-1", userId, name: "OpenAI", providerType: "openai", baseUrl: null, encryptedConfig: {}, isEnabled: true, createdAt: now, updatedAt: now }).run();
  return keys.map((key) => {
    const id = `model-${key}`;
    db.insert(aiModels).values({ id, providerId: "prov-1", modelKey: key, displayName: key.toUpperCase(), capabilities: {}, isDefault: false, isAvailable: true, createdAt: now, updatedAt: now }).run();
    return id;
  });
}

function textOf(messages: ChatMessage[]): string {
  return messages.map((message) => (typeof message.content === "string" ? message.content : "")).join("\n");
}

/** Plays every team member by recognising which prompt it was sent. */
function scriptedClient(script: { plan?: string; implement: (attempt: number) => string; review: (modelId: string, attempt: number) => string }): CollabModelClient & { calls: string[] } {
  let implementCalls = 0;
  const reviewCalls = new Map<string, number>();
  const calls: string[] = [];
  return {
    calls,
    async complete(modelId, messages) {
      const prompt = textOf(messages);
      if (prompt.includes("Break the task")) {
        calls.push(`plan:${modelId}`);
        return script.plan ?? "";
      }
      if (prompt.includes("The run is finished")) {
        calls.push(`summary:${modelId}`);
        return "All done.";
      }
      if (prompt.includes("has made the change below")) {
        const attempt = reviewCalls.get(modelId) ?? 0;
        reviewCalls.set(modelId, attempt + 1);
        calls.push(`review:${modelId}`);
        return script.review(modelId, attempt);
      }
      // Implementer: only the opening turn of each attempt starts a new attempt.
      if (messages.length === 2) implementCalls++;
      calls.push(`implement:${modelId}`);
      return script.implement(implementCalls - 1);
    },
  };
}

// --- workspace sandbox -------------------------------------------------------

test("normalizeTeamFolder rejects absolute paths, traversal and .git", () => {
  assert.equal(normalizeTeamFolder("./projects/site/"), "projects/site");
  for (const bad of ["/etc", "C:/Windows", "../outside", "a/../../b", "repo/.git", "", "."]) {
    assert.throws(() => normalizeTeamFolder(bad), HttpError, bad);
  }
});

test("Workspace refuses paths that escape the folder, including through symlinks", async () => {
  await withCollabEnv((collabRoot) => {
    const workspace = Workspace.open("site");
    const outside = join(collabRoot, "..", "secret.txt");
    writeFileSync(outside, "do not read");
    symlinkSync(join(collabRoot, ".."), join(workspace.root, "escape"));

    assert.throws(() => workspace.read("../secret.txt"), /escapes the workspace/);
    assert.throws(() => workspace.read("/etc/passwd"), /relative to the workspace/);
    assert.throws(() => workspace.read("escape/secret.txt"), /escapes the workspace/);
    assert.throws(() => workspace.write("escape/new.txt", "x"), /escapes the workspace/);
    assert.throws(() => workspace.write(".git/config", "x"), /off limits/);
  });
});

test("Workspace tracks a changeset and can revert writes, creations and deletions", async () => {
  await withCollabEnv(() => {
    const workspace = Workspace.open("site");
    writeFileSync(join(workspace.root, "keep.txt"), "original\n");
    writeFileSync(join(workspace.root, "gone.txt"), "bye\n");

    workspace.write("keep.txt", "edited\n");
    workspace.write("keep.txt", "edited twice\n");
    workspace.write("src/new.ts", "export {};\n");
    workspace.delete("gone.txt");

    assert.deepEqual(
      workspace.changes().map((change) => [change.path, change.before, change.after]),
      [
        ["gone.txt", "bye\n", null],
        ["keep.txt", "original\n", "edited twice\n"],
        ["src/new.ts", null, "export {};\n"],
      ],
    );

    workspace.revert();
    assert.equal(readFileSync(join(workspace.root, "keep.txt"), "utf8"), "original\n");
    assert.equal(readFileSync(join(workspace.root, "gone.txt"), "utf8"), "bye\n");
    assert.equal(existsSync(join(workspace.root, "src/new.ts")), false);
    assert.deepEqual(workspace.changes(), []);
  });
});

test("Workspace.list skips dependency and VCS directories", async () => {
  await withCollabEnv(() => {
    const workspace = Workspace.open("site");
    mkdirSync(join(workspace.root, "node_modules/pkg"), { recursive: true });
    writeFileSync(join(workspace.root, "node_modules/pkg/index.js"), "");
    mkdirSync(join(workspace.root, "src"));
    writeFileSync(join(workspace.root, "src/app.ts"), "");
    assert.equal(workspace.list(), "src/\nsrc/app.ts");
  });
});

test("unifiedDiff shows only the changed lines with context", () => {
  const before = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"].join("\n");
  const after = before.replace("e", "E");
  const diff = unifiedDiff({ path: "x.txt", before, after });
  assert.match(diff, /^--- a\/x\.txt\n\+\+\+ b\/x\.txt\n@@ -2,7 \+2,7 @@/);
  assert.match(diff, /\n-e\n\+E\n/);
  assert.doesNotMatch(diff, /\n a\n/);
  assert.match(unifiedDiff({ path: "new.txt", before: null, after: "hi" }), /--- \/dev\/null[\s\S]*\+hi/);
});

// --- protocol ----------------------------------------------------------------

test("parseAgentTurn reads actions in order, unwraps fenced file bodies, and detects done", () => {
  const turn = parseAgentTurn(
    [
      'I will look first. <list path="."/>',
      '<read path="src/app.ts" />',
      '<write path="src/app.ts">\n```ts\nexport const x = 1;\n```\n</write>',
      "<delete path='old.txt'/>",
      "<test/>",
      '<run>npm run lint -- --fix "src"</run>',
      "<message>Added x.</message>",
      "<done/>",
    ].join("\n"),
  );
  assert.deepEqual(turn.actions, [
    { type: "list", path: "." },
    { type: "read", path: "src/app.ts" },
    { type: "write", path: "src/app.ts", content: "export const x = 1;\n" },
    { type: "delete", path: "old.txt" },
    { type: "test" },
    { type: "run", command: 'npm run lint -- --fix "src"' },
  ]);
  assert.equal(turn.message, "Added x.");
  assert.equal(turn.done, true);
  assert.equal(turn.verdict, null);
  assert.equal(parseAgentTurn("<verdict>approve</verdict><comments>ok</comments>").verdict?.vote, "approve");
});

test("parsePlan and parseVerdict tolerate surrounding prose", () => {
  assert.deepEqual(parsePlan('Plan:\n<step assignee="2">Do A</step>\n<step assignee="x">bad</step>\n<step assignee=\'3\'>Do B</step>'), [
    { assignee: 2, instruction: "Do A" },
    { assignee: 3, instruction: "Do B" },
  ]);
  assert.deepEqual(parseVerdict("<verdict>Reject</verdict><comments>Missing tests.</comments>"), { vote: "reject", comments: "Missing tests." });
  assert.equal(parseVerdict("looks good to me").vote, null);
});

// --- decisions ---------------------------------------------------------------

test("decide applies majority, unanimous and precedence policies", () => {
  const votes = [
    { memberId: "a", precedence: 1, vote: "reject" as const },
    { memberId: "b", precedence: 2, vote: "approve" as const },
    { memberId: "c", precedence: 3, vote: "approve" as const },
  ];
  assert.equal(decide("majority", votes).approved, true);
  assert.equal(decide("unanimous", votes).approved, false);
  assert.equal(decide("precedence", votes).approved, false);

  // A majority tie is broken by the highest-ranked voter; abstentions don't count.
  const tied = [votes[0]!, votes[1]!, { memberId: "d", precedence: 4, vote: null }];
  assert.deepEqual(decide("majority", tied).approved, false);
  assert.equal(decide("majority", []).approved, true);
  assert.equal(decide("majority", [{ memberId: "d", precedence: 4, vote: null }]).approved, false);
});

// --- orchestration -----------------------------------------------------------

async function setupTeam(policy = "majority", maxRevisions = 2) {
  const db = getDb();
  const user = new AuthService(db).register({ email: "admin@example.com", fullName: "Admin", password: "password123" });
  const [lead, impl, reviewer] = seedModels(db, user.id, ["lead", "impl", "rev"]);
  const { team } = new CollabService(db).createTeam(user.id, {
    name: "Builders",
    folder: "site",
    decision_policy: policy,
    max_revisions: maxRevisions,
    members: [
      { model_id: lead!, role: "lead", precedence: 1 },
      { model_id: impl!, role: "implementer", precedence: 2, instructions: "Write TypeScript." },
      { model_id: reviewer!, role: "reviewer", precedence: 3 },
    ],
  });
  const repo = new CollabRepository(db);
  return { db, user, team, repo, models: { lead: lead!, impl: impl!, reviewer: reviewer! } };
}

const PLAN = '<step assignee="2">Create hello.txt saying hello.</step>';

test("a run plans, edits the folder, gets reviewed, and keeps approved work", async () => {
  await withCollabEnv(async () => {
    const { db, user, team, repo, models } = await setupTeam();
    const client = scriptedClient({
      plan: PLAN,
      implement: () => '<write path="hello.txt">hello\n</write><message>Created it.</message><done/>',
      review: () => "<verdict>approve</verdict><comments>Fine.</comments>",
    });

    const run = repo.createRun({ teamId: team.id, userId: user.id, task: "Say hello" });
    const finished = await new CollabOrchestrator(db, client).execute(run.id);

    assert.equal(finished.status, "completed");
    assert.equal(readFileSync(join(Workspace.open("site").root, "hello.txt"), "utf8"), "hello\n");
    // Both the lead and the reviewer validate the implementer's change.
    assert.deepEqual(client.calls, [`plan:${models.lead}`, `implement:${models.impl}`, `review:${models.lead}`, `review:${models.reviewer}`, `summary:${models.lead}`]);
    const steps = (finished.result as { steps: Array<{ status: string; files: string[] }> }).steps;
    assert.deepEqual(steps.map((step) => [step.status, step.files]), [["approved", ["hello.txt"]]]);
    const kinds = repo.listMessages(run.id).map((message) => message.kind);
    for (const kind of ["plan", "action", "message", "change", "review", "decision", "summary"]) assert.ok(kinds.includes(kind), kind);
  });
});

test("a rejected change is reverted and sent back with the reviewers' feedback", async () => {
  await withCollabEnv(async () => {
    const { db, user, team, repo } = await setupTeam("unanimous");
    const prompts: string[] = [];
    const client = scriptedClient({
      plan: PLAN,
      implement: (attempt) => (attempt === 0 ? '<write path="hello.txt">helo\n</write><done/>' : '<write path="hello.txt">hello\n</write><done/>'),
      review: (_model, attempt) => (attempt === 0 ? "<verdict>reject</verdict><comments>Typo: helo.</comments>" : "<verdict>approve</verdict>"),
    });
    const recording: CollabModelClient = {
      complete: (modelId, messages) => {
        prompts.push(textOf(messages));
        return client.complete(modelId, messages);
      },
    };

    const run = repo.createRun({ teamId: team.id, userId: user.id, task: "Say hello" });
    const finished = await new CollabOrchestrator(db, recording).execute(run.id);

    assert.equal(finished.status, "completed");
    assert.equal(readFileSync(join(Workspace.open("site").root, "hello.txt"), "utf8"), "hello\n");
    assert.ok(prompts.some((prompt) => prompt.includes("previous attempt was rejected") && prompt.includes("Typo: helo.")));
    const step = (finished.result as { steps: Array<{ status: string; revisions: number }> }).steps[0]!;
    assert.deepEqual([step.status, step.revisions], ["approved", 1]);
  });
});

test("a step still rejected after its last revision is abandoned and its edits reverted", async () => {
  await withCollabEnv(async () => {
    const { db, user, team, repo } = await setupTeam("majority", 0);
    writeFileSync(join(Workspace.open("site").root, "hello.txt"), "original\n");
    const client = scriptedClient({
      plan: PLAN,
      implement: () => '<write path="hello.txt">bad\n</write><done/>',
      review: () => "<verdict>reject</verdict><comments>No.</comments>",
    });

    const run = repo.createRun({ teamId: team.id, userId: user.id, task: "Say hello" });
    const finished = await new CollabOrchestrator(db, client).execute(run.id);

    assert.equal(finished.status, "completed");
    assert.equal(readFileSync(join(Workspace.open("site").root, "hello.txt"), "utf8"), "original\n");
    assert.equal((finished.result as { steps: Array<{ status: string }> }).steps[0]!.status, "rejected");
  });
});

test("cancelling a run stops it at the next model call and reverts the step in progress", async () => {
  await withCollabEnv(async () => {
    const { db, user, team, repo } = await setupTeam();
    const run = repo.createRun({ teamId: team.id, userId: user.id, task: "Say hello" });
    const client = scriptedClient({
      plan: PLAN,
      implement: () => {
        repo.requestCancel(run.id);
        return '<write path="hello.txt">hello\n</write><done/>';
      },
      review: () => "<verdict>approve</verdict>",
    });

    const finished = await new CollabOrchestrator(db, client).execute(run.id);
    assert.equal(finished.status, "cancelled");
    assert.equal(existsSync(join(Workspace.open("site").root, "hello.txt")), false);
  });
});

test("a model failure fails the run with its message", async () => {
  await withCollabEnv(async () => {
    const { db, user, team, repo } = await setupTeam();
    const run = repo.createRun({ teamId: team.id, userId: user.id, task: "Say hello" });
    const failing: CollabModelClient = { complete: async () => Promise.reject(new Error("rate limited")) };
    const finished = await new CollabOrchestrator(db, failing).execute(run.id);
    assert.equal(finished.status, "failed");
    assert.equal(finished.errorMessage, "rate limited");
  });
});

// --- service -----------------------------------------------------------------

test("CollabService validates team membership rules", async () => {
  await withCollabEnv(() => {
    const db = getDb();
    const user = new AuthService(db).register({ email: "admin@example.com", fullName: "Admin", password: "password123" });
    const [a, b] = seedModels(db, user.id, ["a", "b"]);
    const service = new CollabService(db);
    const base = { name: "T", folder: "site" };

    assert.throws(() => service.createTeam(user.id, { ...base, members: [{ model_id: a!, role: "reviewer", precedence: 1 }] }), /at least one implementer/);
    assert.throws(
      () => service.createTeam(user.id, { ...base, members: [{ model_id: a!, role: "implementer", precedence: 1 }, { model_id: b!, role: "reviewer", precedence: 1 }] }),
      /share precedence #1/,
    );
    assert.throws(() => service.createTeam(user.id, { ...base, members: [{ model_id: "nope", role: "implementer", precedence: 1 }] }), /not an enabled model/);
    assert.throws(() => service.createTeam(user.id, { ...base, folder: "../x", members: [{ model_id: a!, role: "implementer", precedence: 1 }] }), /inside the collaboration root/);
    assert.throws(() => service.createTeam(user.id, { ...base, decision_policy: "vibes", members: [{ model_id: a!, role: "implementer", precedence: 1 }] }), /decision_policy/);

    const { members } = service.createTeam(user.id, { ...base, members: [{ model_id: b!, role: "reviewer", precedence: 2 }, { model_id: a!, role: "implementer", precedence: 1 }] });
    assert.deepEqual(members.map((member) => [member.precedence, member.name, member.role]), [[1, "A", "implementer"], [2, "B", "reviewer"]]);
  });
});

test("startRun refuses a second concurrent run on the same folder, then runs in the background", async () => {
  await withCollabEnv(async () => {
    const { db, user, team } = await setupTeam();
    const other = new CollabService(db).createTeam(user.id, {
      name: "Second team",
      folder: "site",
      members: [{ model_id: "model-impl", role: "implementer", precedence: 1 }],
    }).team;

    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const client = scriptedClient({ plan: PLAN, implement: () => "<done/>", review: () => "<verdict>approve</verdict>" });
    const gated: CollabModelClient = { complete: async (modelId, messages) => (await gate, client.complete(modelId, messages)) };
    const runner = new CollabRunner(db, () => gated);
    __setCollabRunnerForTests(runner);

    const service = new CollabService(db);
    const run = service.startRun(user.id, team.id, "Say hello");
    assert.throws(() => service.startRun(user.id, other.id, "Also edit site"), /already working in "site"/);
    assert.throws(() => service.deleteTeam(user.id, team.id), /Cancel the team's run/);

    release();
    const finished = await runner.wait(run.id);
    assert.equal(finished?.status, "completed");
    assert.equal(service.startRun(user.id, other.id, "Now it's free").status, "queued");
    await runner.wait(service.listRuns(user.id, other.id)[0]!.id);
  });
});

test("recoverInterrupted fails runs left active by a previous process", async () => {
  await withCollabEnv(async () => {
    const { db, user, team, repo } = await setupTeam();
    const run = repo.createRun({ teamId: team.id, userId: user.id, task: "Say hello" });
    repo.updateRun(run.id, { status: "running" });

    new CollabRunner(db).recoverInterrupted();
    const recovered = repo.getRun(run.id)!;
    assert.equal(recovered.status, "failed");
    assert.match(recovered.errorMessage ?? "", /server restart/);
  });
});
