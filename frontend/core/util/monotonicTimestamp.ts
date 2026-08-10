let lastMs = 0;

/**
 * ISO timestamp guaranteed strictly greater than every previous call within
 * this process. Plain `new Date().toISOString()` has 1ms resolution, so
 * rows inserted back-to-back synchronously (or within the same microtask
 * tick) can tie — which breaks any "messages created after this one" cutoff
 * query that compares createdAt with `>`. Chat message ordering depends on
 * that comparison (see ChatService.updateMessage), so ties are not safe to
 * ignore there.
 */
export function monotonicIsoTimestamp(): string {
  let now = Date.now();
  if (now <= lastMs) {
    now = lastMs + 1;
  }
  lastMs = now;
  return new Date(now).toISOString();
}
