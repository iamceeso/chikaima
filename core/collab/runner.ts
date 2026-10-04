import type { ChikaimaDatabase } from "../db/client.js";
import { CollabOrchestrator, ProviderModelClient, type CollabModelClient } from "./orchestrator.js";
import { CollabRepository, type CollabRunRow } from "./repository.js";

/**
 * Runs collaboration runs in the background of the long-lived `next start`
 * process. Runs are not retried like media jobs: a run edits files, so
 * replaying one after a crash could apply work twice. Instead, runs left
 * active by a previous process are marked failed on startup.
 */
export class CollabRunner {
  private readonly repo: CollabRepository;
  private readonly inFlight = new Map<string, Promise<CollabRunRow>>();

  constructor(
    private readonly db: ChikaimaDatabase,
    private readonly clientFor: (userId: string) => CollabModelClient = (userId) => new ProviderModelClient(userId, db),
  ) {
    this.repo = new CollabRepository(db);
  }

  /** Fails runs orphaned by a previous process. Call once at startup, before launching anything. */
  recoverInterrupted(): void {
    for (const run of this.repo.listAllActiveRuns()) {
      if (this.inFlight.has(run.id)) continue;
      this.repo.updateRun(run.id, { status: "failed", errorMessage: "Interrupted by a server restart.", completedAt: new Date().toISOString() });
      this.repo.appendMessage({
        runId: run.id,
        userId: run.userId,
        kind: "error",
        content: "Interrupted by a server restart. Edits from the step in progress may remain in the folder.",
      });
    }
  }

  launch(run: CollabRunRow): Promise<CollabRunRow> {
    const orchestrator = new CollabOrchestrator(this.db, this.clientFor(run.userId));
    const promise = orchestrator.execute(run.id).finally(() => this.inFlight.delete(run.id));
    this.inFlight.set(run.id, promise);
    return promise;
  }

  /** Resolves when the given run (if running in this process) finishes. */
  wait(runId: string): Promise<CollabRunRow | undefined> {
    return this.inFlight.get(runId) ?? Promise.resolve(this.repo.getRun(runId));
  }
}

const globalKey = "__chikaimaCollabRunner__";

/** Process-wide singleton, guarded against Next.js dev-mode module re-evaluation via globalThis. */
export function getCollabRunner(db: ChikaimaDatabase): CollabRunner {
  const globalRef = globalThis as typeof globalThis & { [globalKey]?: CollabRunner };
  if (!globalRef[globalKey]) {
    const runner = new CollabRunner(db);
    runner.recoverInterrupted();
    globalRef[globalKey] = runner;
  }
  return globalRef[globalKey]!;
}

/** Test-only: install a runner (e.g. one with a fake model client) as the process singleton. */
export function __setCollabRunnerForTests(runner: CollabRunner | null): void {
  const globalRef = globalThis as typeof globalThis & { [globalKey]?: CollabRunner };
  if (runner) globalRef[globalKey] = runner;
  else delete globalRef[globalKey];
}
