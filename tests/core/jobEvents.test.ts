import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AuthService } from "../../core/auth/authService.js";
import { __resetConfigForTests } from "../../core/config/index.js";
import { __resetSecretManagerForTests } from "../../core/crypto/index.js";
import { getDb, __resetDbForTests } from "../../core/db/client.js";
import { HttpError } from "../../core/errors.js";
import { JobDispatcher } from "../../core/jobs/dispatcher.js";
import { getJobEventBus, type JobEventRow } from "../../core/jobs/events.js";
import { JobRepository } from "../../core/jobs/repository.js";

async function withTempDb<T>(fn: () => T | Promise<T>): Promise<T> {
  const dbDir = mkdtempSync(join(tmpdir(), "chikaima-job-events-"));
  const previous = process.env.CHIKAIMA_DB_PATH;
  process.env.CHIKAIMA_DB_PATH = join(dbDir, "test.db");
  __resetConfigForTests();
  __resetDbForTests();
  __resetSecretManagerForTests();
  try {
    return await fn();
  } finally {
    __resetDbForTests();
    __resetConfigForTests();
    __resetSecretManagerForTests();
    if (previous === undefined) delete process.env.CHIKAIMA_DB_PATH;
    else process.env.CHIKAIMA_DB_PATH = previous;
    rmSync(dbDir, { recursive: true, force: true });
  }
}

function registerUser(email = "user@example.com") {
  return new AuthService(getDb()).register({ email, fullName: "User", password: "password123" });
}

function newJob(repo: JobRepository, userId: string, dependsOn?: string[]) {
  return repo.create({ userId, jobType: "document_analysis", resourceType: "document", resourceId: "doc", dependsOn });
}

test("lifecycle transitions are recorded as an append-only event history", async () => {
  await withTempDb(() => {
    const user = registerUser();
    const repo = new JobRepository(getDb());
    const job = newJob(repo, user.id);

    repo.claimNextQueued();
    repo.markFailedOrRetry(job.id, "boom 1");
    repo.claimNextQueued();
    repo.markProgress(job.id, 50, "Generating summary");
    repo.markCompleted(job.id, { ok: true });

    const events = repo.listEvents(job.id);
    assert.deepEqual(
      events.map((event) => event.eventType),
      ["queued", "started", "retry_scheduled", "started", "stage", "completed"],
    );
    assert.equal(events[2]!.message, "boom 1");
    assert.equal(events[4]!.message, "Generating summary");
    assert.deepEqual(events[4]!.data, { stage: "Generating summary", progress: 50 });
    assert.ok(events.every((event, index) => index === 0 || event.id > events[index - 1]!.id));
  });
});

test("markProgress without a stage updates progress but records no event", async () => {
  await withTempDb(() => {
    const user = registerUser();
    const repo = new JobRepository(getDb());
    const job = newJob(repo, user.id);
    repo.markProgress(job.id, 30);
    assert.equal(repo.get(job.id)!.progress, 30);
    assert.deepEqual(repo.listEvents(job.id).map((event) => event.eventType), ["queued"]);
  });
});

test("a dependent job is not claimed until every upstream job has completed", async () => {
  await withTempDb(() => {
    const user = registerUser();
    const repo = new JobRepository(getDb());
    const upstreamA = newJob(repo, user.id);
    const upstreamB = newJob(repo, user.id);
    const dependent = newJob(repo, user.id, [upstreamA.id, upstreamB.id]);

    assert.equal(repo.claimNextQueued()!.id, upstreamA.id);
    assert.equal(repo.claimNextQueued()!.id, upstreamB.id);
    assert.equal(repo.claimNextQueued(), undefined, "dependent must wait while upstreams are running");

    repo.markCompleted(upstreamA.id, {});
    assert.equal(repo.claimNextQueued(), undefined, "dependent must wait for every upstream");

    repo.markCompleted(upstreamB.id, {});
    assert.equal(repo.claimNextQueued()!.id, dependent.id);
  });
});

test("a waiting dependent does not block unrelated jobs queued after it", async () => {
  await withTempDb(() => {
    const user = registerUser();
    const repo = new JobRepository(getDb());
    const upstream = newJob(repo, user.id);
    repo.claimNextQueued();
    newJob(repo, user.id, [upstream.id]);
    const unrelated = newJob(repo, user.id);

    assert.equal(repo.claimNextQueued()!.id, unrelated.id);
  });
});

test("a terminal upstream failure cancels queued dependents transitively; a retryable one does not", async () => {
  await withTempDb(() => {
    const user = registerUser();
    const repo = new JobRepository(getDb());
    const upstream = newJob(repo, user.id);
    const child = newJob(repo, user.id, [upstream.id]);
    const grandchild = newJob(repo, user.id, [child.id]);

    repo.claimNextQueued();
    repo.markFailedOrRetry(upstream.id, "transient");
    assert.equal(repo.get(child.id)!.status, "queued", "a retry must not cancel dependents");

    for (let attempt = 2; attempt <= 3; attempt += 1) {
      repo.claimNextQueued();
      repo.markFailedOrRetry(upstream.id, "still broken");
    }
    assert.equal(repo.get(upstream.id)!.status, "failed");

    for (const id of [child.id, grandchild.id]) {
      const job = repo.get(id)!;
      assert.equal(job.status, "failed");
      assert.match(job.errorMessage ?? "", /^Cancelled: upstream job/);
      assert.equal(repo.listEvents(id).at(-1)!.eventType, "cancelled");
    }
  });
});

test("JobDispatcher rejects dependencies on unknown jobs or jobs owned by another user", async () => {
  await withTempDb(() => {
    const owner = registerUser("owner@example.com");
    const other = registerUser("other@example.com");
    const repo = new JobRepository(getDb());
    const othersJob = newJob(repo, other.id);
    const dispatcher = new JobDispatcher(getDb());

    for (const dependsOn of [["does-not-exist"], [othersJob.id]]) {
      assert.throws(
        () => dispatcher.createJob(owner.id, "document_analysis", "doc", { dependsOn }),
        (error: unknown) => error instanceof HttpError && error.statusCode === 400,
      );
    }
    assert.equal(repo.listForUser(owner.id).length, 0, "nothing should be enqueued on rejection");
  });
});

test("the event bus delivers each user only their own events, and unsubscribe stops delivery", async () => {
  await withTempDb(() => {
    const alice = registerUser("alice@example.com");
    const bob = registerUser("bob@example.com");
    const repo = new JobRepository(getDb());

    const received: JobEventRow[] = [];
    const unsubscribe = getJobEventBus().subscribe(alice.id, (event) => received.push(event));
    try {
      const alicesJob = newJob(repo, alice.id);
      newJob(repo, bob.id);
      assert.deepEqual(received.map((event) => [event.jobId, event.eventType]), [[alicesJob.id, "queued"]]);
    } finally {
      unsubscribe();
    }
    newJob(repo, alice.id);
    assert.equal(received.length, 1);
  });
});

test("listEventsForUserAfter replays only that user's events newer than the cursor", async () => {
  await withTempDb(() => {
    const alice = registerUser("alice@example.com");
    const bob = registerUser("bob@example.com");
    const repo = new JobRepository(getDb());
    const first = newJob(repo, alice.id);
    const cursor = repo.listEvents(first.id).at(-1)!.id;
    newJob(repo, bob.id);
    const second = newJob(repo, alice.id);

    const replay = repo.listEventsForUserAfter(alice.id, cursor);
    assert.deepEqual(replay.map((event) => event.jobId), [second.id]);
    assert.equal(repo.listEventsForUserAfter(alice.id, 0).length, 2);
  });
});

test("recoverStaleRunning records why each crashed job was requeued or failed", async () => {
  await withTempDb(() => {
    const user = registerUser();
    const repo = new JobRepository(getDb());
    const job = newJob(repo, user.id);
    repo.claimNextQueued();

    repo.recoverStaleRunning();
    const last = repo.listEvents(job.id).at(-1)!;
    assert.equal(last.eventType, "recovered");
    assert.match(last.message ?? "", /restart/);
  });
});
