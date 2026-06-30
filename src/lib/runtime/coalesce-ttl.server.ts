// In-process TTL cache + single-flight for outbound gateway reads.
//
// Why: under high checkout concurrency, every client poll (~700ms) triggers
// `reconcileCheckoutSaleWithGateway`, which calls Payflax `/api/transactions`.
// With N concurrent checkouts you get N parallel GETs for the SAME upstream
// payload — wasteful, slow, and a fast path to provider rate-limits.
//
// This helper:
// 1. Coalesces concurrent callers onto a single in-flight Promise (single-flight).
// 2. Caches the resolved value for `ttlMs` so subsequent callers within the
//    window get an instant hit without touching the network.
//
// Scope is per-worker-process. That's fine: with M workers we cap upstream
// load at M req/s/key instead of (active_pollers) req/s/key. Failures are
// NEVER cached — only successful resolutions populate the cache.
//
// Pure infrastructure: callers receive the exact same value shape they would
// from the raw fetcher, so no business logic changes.

type Entry<T> = { value: T; expiresAt: number };

const cache = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

// Soft cap to keep memory bounded under pathological key cardinality.
const MAX_ENTRIES = 500;

function pruneIfNeeded() {
  if (cache.size <= MAX_ENTRIES) return;
  // Cheap eviction: drop the oldest ~10% by insertion order (Map preserves it).
  const drop = Math.ceil(MAX_ENTRIES * 0.1);
  let i = 0;
  for (const key of cache.keys()) {
    if (i++ >= drop) break;
    cache.delete(key);
  }
}

/**
 * Coalesce + cache an async producer keyed by `key`.
 * - Hit within TTL → return cached value (no fetch).
 * - Miss with in-flight request → await the same Promise (no parallel fetch).
 * - Cold miss → run `producer`, cache successful result for `ttlMs`.
 *
 * `null`/`undefined` results are NOT cached so transient gateway misses retry
 * on the very next call rather than being remembered for the full window.
 */
export async function coalesceTtl<T>(
  key: string,
  ttlMs: number,
  producer: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key) as Entry<T> | undefined;
  if (hit && hit.expiresAt > now) return hit.value;

  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const exec = (async () => {
    try {
      const value = await producer();
      if (value !== null && value !== undefined) {
        cache.set(key, { value, expiresAt: Date.now() + ttlMs });
        pruneIfNeeded();
      }
      return value;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, exec as Promise<unknown>);
  return exec;
}
