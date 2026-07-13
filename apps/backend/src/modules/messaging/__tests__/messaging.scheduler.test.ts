import { describe, it, expect, vi } from "vitest";
import { startMessagingScheduler, shouldScheduleMessaging } from "../messaging.scheduler";

describe("shouldScheduleMessaging", () => {
  it("always schedules (Redis-free, safe on cloud + store-node)", () => {
    expect(shouldScheduleMessaging()).toBe(true);
  });
});

describe("startMessagingScheduler", () => {
  it("drains immediately then on interval; stop() clears it", async () => {
    vi.useFakeTimers();
    const drainImpl = vi.fn(async () => ({ sent: 0, failed: 0, skipped: 0 }));
    const stop = startMessagingScheduler({} as any, (async () => ({})) as any, {
      intervalMs: 1000,
      drainImpl,
    });
    expect(drainImpl).toHaveBeenCalledTimes(1); // immediate
    await vi.advanceTimersByTimeAsync(1000);
    expect(drainImpl).toHaveBeenCalledTimes(2);
    stop();
    await vi.advanceTimersByTimeAsync(3000);
    expect(drainImpl).toHaveBeenCalledTimes(2); // no more after stop
    vi.useRealTimers();
  });

  it("a throwing drain does not crash the tick", async () => {
    vi.useFakeTimers();
    const drainImpl = vi.fn(async () => {
      throw new Error("boom");
    });
    const stop = startMessagingScheduler({} as any, (async () => ({})) as any, {
      intervalMs: 1000,
      drainImpl,
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(drainImpl).toHaveBeenCalledTimes(2);
    stop();
    vi.useRealTimers();
  });
});
