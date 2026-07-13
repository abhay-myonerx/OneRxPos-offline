import { describe, it, expect, vi, beforeEach } from "vitest";

// Controllable Redis stand-in: `ready` toggles the branch; incr/pexpire are spies.
const state = { ready: false };
const incr = vi.fn(async (_key: string) => 1);
const pexpire = vi.fn(async (_key: string, _ms: number) => 1);

vi.mock("../../config/redis", () => ({
  redis: {
    incr: (k: string) => incr(k),
    pexpire: (k: string, ms: number) => pexpire(k, ms),
  },
  isRedisReady: () => state.ready,
}));

import { hitRateLimit } from "../rate-limit-backend";

beforeEach(() => {
  state.ready = false;
  incr.mockClear();
  pexpire.mockClear();
});

describe("hitRateLimit — Redis-or-in-memory rate-limit backend (SN-2)", () => {
  it("in-memory (Redis not ready): increments per key, keys independent, never touches Redis", async () => {
    const a = `mem-${Date.now()}-a`;
    expect(await hitRateLimit(a, 60_000)).toBe(1);
    expect(await hitRateLimit(a, 60_000)).toBe(2);
    expect(await hitRateLimit(a, 60_000)).toBe(3);

    const b = `mem-${Date.now()}-b`;
    expect(await hitRateLimit(b, 60_000)).toBe(1); // separate key, separate count

    expect(incr).not.toHaveBeenCalled();
    expect(pexpire).not.toHaveBeenCalled();
  });

  it("in-memory: a fresh window resets the count", async () => {
    const k = `mem-win-${Date.now()}`;
    expect(await hitRateLimit(k, 1)).toBe(1); // 1ms window
    await new Promise((r) => setTimeout(r, 8));
    expect(await hitRateLimit(k, 1)).toBe(1); // window expired → reset to 1
  });

  it("Redis path (ready): uses INCR and sets PEXPIRE on the first hit", async () => {
    state.ready = true;
    incr.mockResolvedValueOnce(1);
    const k = `rl-${Date.now()}`;
    expect(await hitRateLimit(k, 60_000)).toBe(1);
    expect(incr).toHaveBeenCalledWith(k);
    expect(pexpire).toHaveBeenCalledWith(k, 60_000);
  });

  it("Redis path: does NOT reset the TTL on subsequent hits", async () => {
    state.ready = true;
    incr.mockResolvedValueOnce(2); // not the first hit in the window
    await hitRateLimit(`rl2-${Date.now()}`, 60_000);
    expect(pexpire).not.toHaveBeenCalled();
  });
});
