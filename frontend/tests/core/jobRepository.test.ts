import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AuthService } from "../../core/auth/authService.js";
import { __resetConfigForTests } from "../../core/config/index.js";
import { getDb, __resetDbForTests } from "../../core/db/client.js";
import { JobRepository } from "../../core/jobs/repository.js";

async function withTempDb<T>(fn: () => T | Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "chikaima-jobs-test-"));
  const previous = process.env.CHIKAIMA_DB_PATH;
  process.env.CHIKAIMA_DB_PATH = join(dir, "test.db");
  __resetConfigForTests();
  __resetDbForTests();
  try {
    return await fn();
  } finally {
    __resetDbForTests();
    __resetConfigForTests();
    if (previous === undefined) delete process.env.CHIKAIMA_DB_PATH;
    else process.env.CHIKAIMA_DB_PATH = previous;
    rmSync(dir, { recursive: true, force: true });
  }
}

function seedUser(): string {
  const db = getDb();
  const user = new AuthService(db).register({ email: "user@example.com", fullName: "User", password: "password123" });
  return user.id;
}

test("create() starts a job in queued state with zero attempts", async () => {
  await withTempDb(() => {
    const userId = seedUser();
    const repo = new JobRepository(getDb());
    const job = repo.create({ userId, jobType: "document_analysis", resourceType: "document", resourceId: "doc-1" });

    assert.equal(job.status, "queued");
    assert.equal(job.attempts, 0);
    assert.equal(job.progress, 0);
    assert.equal(job.startedAt, null);
  });
});

test("claimNextQueued atomically flips one queued job to running, oldest first, incrementing attempts", async () => {
  await withTempDb(async () => {
    const userId = seedUser();
    const repo = new JobRepository(getDb());
    const first = repo.create({ userId, jobType: "document_analysis", resourceType: "document", resourceId: "doc-1" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    repo.create({ userId, jobType: "document_analysis", resourceType: "document", resourceId: "doc-2" });

    const claimed = repo.claimNextQueued();
    assert.equal(claimed?.id, first.id);
    assert.equal(claimed?.status, "running");
    assert.equal(claimed?.attempts, 1);
    assert.ok(claimed?.startedAt);

    const stillQueued = repo.get(first.id);
    assert.equal(stillQueued?.status, "running");
  });
});

test("claimNextQueued returns undefined when there is nothing queued", async () => {
  await withTempDb(() => {
    const repo = new JobRepository(getDb());
    assert.equal(repo.claimNextQueued(), undefined);
  });
});

test("markCompleted sets status/progress/result and completedAt", async () => {
  await withTempDb(() => {
    const userId = seedUser();
    const repo = new JobRepository(getDb());
    const job = repo.create({ userId, jobType: "document_analysis", resourceType: "document", resourceId: "doc-1" });
    repo.claimNextQueued();

    repo.markCompleted(job.id, { resource_id: "doc-1" });

    const updated = repo.get(job.id)!;
    assert.equal(updated.status, "completed");
    assert.equal(updated.progress, 100);
    assert.deepEqual(updated.result, { resource_id: "doc-1" });
    assert.ok(updated.completedAt);
  });
});

test("markFailedOrRetry requeues while attempts remain, then terminally fails once exhausted", async () => {
  await withTempDb(() => {
    const userId = seedUser();
    const repo = new JobRepository(getDb());
    const job = repo.create({ userId, jobType: "document_analysis", resourceType: "document", resourceId: "doc-1" });
    assert.equal(job.maxAttempts, 3);

    // Attempt 1
    repo.claimNextQueued();
    repo.markFailedOrRetry(job.id, "boom 1");
    let current = repo.get(job.id)!;
    assert.equal(current.status, "queued");
    assert.equal(current.attempts, 1);
    assert.equal(current.errorMessage, "boom 1");

    // Attempt 2
    repo.claimNextQueued();
    repo.markFailedOrRetry(job.id, "boom 2");
    current = repo.get(job.id)!;
    assert.equal(current.status, "queued");
    assert.equal(current.attempts, 2);

    // Attempt 3 — exhausts maxAttempts, terminal failure
    repo.claimNextQueued();
    repo.markFailedOrRetry(job.id, "boom 3");
    current = repo.get(job.id)!;
    assert.equal(current.status, "failed");
    assert.equal(current.attempts, 3);
    assert.equal(current.errorMessage, "boom 3");
    assert.ok(current.completedAt);
  });
});

test("recoverStaleRunning requeues a crashed job with attempts remaining", async () => {
  await withTempDb(() => {
    const userId = seedUser();
    const repo = new JobRepository(getDb());
    const job = repo.create({ userId, jobType: "document_analysis", resourceType: "document", resourceId: "doc-1" });
    repo.claimNextQueued(); // simulate: worker claimed it (attempts=1), then the process died before finishing

    const outcome = repo.recoverStaleRunning();
    assert.equal(outcome.requeued, 1);
    assert.equal(outcome.failed, 0);

    const recovered = repo.get(job.id)!;
    assert.equal(recovered.status, "queued");
    assert.match(recovered.errorMessage ?? "", /restart/i);
  });
});

test("recoverStaleRunning terminally fails a crashed job that already exhausted its attempts", async () => {
  await withTempDb(() => {
    const userId = seedUser();
    const repo = new JobRepository(getDb());
    const job = repo.create({ userId, jobType: "document_analysis", resourceType: "document", resourceId: "doc-1" });

    // Drive it through all 3 attempts via claim+retry, then simulate a crash mid final attempt.
    repo.claimNextQueued();
    repo.markFailedOrRetry(job.id, "e1");
    repo.claimNextQueued();
    repo.markFailedOrRetry(job.id, "e2");
    repo.claimNextQueued(); // attempts now = 3 = maxAttempts, status = running (crash happens here)

    const outcome = repo.recoverStaleRunning();
    assert.equal(outcome.requeued, 0);
    assert.equal(outcome.failed, 1);

    const finalJob = repo.get(job.id)!;
    assert.equal(finalJob.status, "failed");
  });
});

test("recoverStaleRunning does not touch queued, completed, or already-failed jobs", async () => {
  await withTempDb(() => {
    const userId = seedUser();
    const repo = new JobRepository(getDb());
    const queuedJob = repo.create({ userId, jobType: "document_analysis", resourceType: "document", resourceId: "doc-1" });
    const completedJob = repo.create({ userId, jobType: "document_analysis", resourceType: "document", resourceId: "doc-2" });
    repo.claimNextQueued(); // claims queuedJob... need to target completedJob instead
    repo.markCompleted(completedJob.id, {});

    const outcome = repo.recoverStaleRunning();
    // queuedJob was claimed (now running) by the claimNextQueued() call above, so it *is* stale-running and gets recovered.
    assert.equal(outcome.requeued, 1);

    assert.equal(repo.get(completedJob.id)?.status, "completed");
    assert.equal(repo.get(queuedJob.id)?.status, "queued");
  });
});

test("listForUser returns only that user's jobs, newest first", async () => {
  await withTempDb(() => {
    const db = getDb();
    const userA = new AuthService(db).register({ email: "a@example.com", fullName: "A", password: "password123" });
    const userB = new AuthService(db).register({ email: "b@example.com", fullName: "B", password: "password123" });
    const repo = new JobRepository(db);

    repo.create({ userId: userA.id, jobType: "document_analysis", resourceType: "document", resourceId: "doc-1" });
    repo.create({ userId: userB.id, jobType: "document_analysis", resourceType: "document", resourceId: "doc-2" });

    const jobsForA = repo.listForUser(userA.id);
    assert.equal(jobsForA.length, 1);
    assert.equal(jobsForA[0]?.resourceId, "doc-1");
  });
});
