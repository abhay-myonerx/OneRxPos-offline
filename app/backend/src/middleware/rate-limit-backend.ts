// Fixed-window rate-limit counter with a Redis-or-in-memory backend.
//
// On the cloud (Redis ready) it uses `INCR` + `PEXPIRE` exactly as before —
// shared across instances. On the store-node (DATA_BACKEND=sqlite, Redis
// optional/absent) it falls back to an in-process Map, so rate limiting keeps
// working — and login is NOT fail-closed — with no external services. The
// in-memory counter is per-process, which is correct for a single store-node.

import { redis, isRedisReady } from "../config/redis";

interface Window {
  count: number;
  expires: number;
}

const memory = new Map<string, Window>();

// Bound memory on a long-running store-node: prune expired windows when the map
// grows past a threshold (fixed-window keys are short-lived, so this is rare).
function pruneExpired(now: number): void {
  for (const [key, win] of memory) {
    if (win.expires <= now) memory.delete(key);
  }
}

/**
 * Increment the counter for `key` within `windowMs` and return the new count.
 * Redis-backed when available; in-memory otherwise.
 */
export async function hitRateLimit(key: string, windowMs: number): Promise<number> {
  if (isRedisReady()) {
    const count = await redis.incr(key);
    // Set the TTL only on the first increment (avoids resetting the window).
    if (count === 1) await redis.pexpire(key, windowMs);
    return count;
  }

  const now = Date.now();
  if (memory.size > 5000) pruneExpired(now);

  const win = memory.get(key);
  if (!win || win.expires <= now) {
    memory.set(key, { count: 1, expires: now + windowMs });
    return 1;
  }
  win.count += 1;
  return win.count;
}
