// src/sync/store-node/__tests__/drain-scheduler.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// SN-3 Task 3 — TDD spec for the boot-time drain scheduler.
//
// `shouldScheduleDrain` is pure config-gating: sqlite backend + cloud URL +
// master key, all three required. `startDrainScheduler` is exercised with an
// injected `drainImpl` spy + fake timers so no real cloud/DB is needed — the
// scheduler's own contract (immediate first tick, interval ticks, stop()
// clears it) is what's under test, not `drainOutbox` itself (covered by
// outbox-drainer.test.ts).
//
// Env isolation mirrors src/config/__tests__/data-backend.test.ts:
// vi.stubEnv + vi.resetModules + fresh dynamic import per test, since
// `config` is parsed once at module load.
// ─────────────────────────────────────────────────────────────────────────────
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import { deriveLocalDbKey } from "../../../local/key-derivation";

describe("shouldScheduleDrain (SN-3 Task 3)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("true when DATA_BACKEND=sqlite AND SYNC_CLOUD_URL AND LOCAL_DB_MASTER_KEY are all set", async () => {
    vi.resetModules();
    vi.stubEnv("DATA_BACKEND", "sqlite");
    vi.stubEnv("SYNC_CLOUD_URL", "http://cloud.test");
    vi.stubEnv("LOCAL_DB_MASTER_KEY", "a-real-master-key-0123456789abcdef");

    const { shouldScheduleDrain } = await import("../drain-scheduler");
    expect(shouldScheduleDrain()).toBe(true);
  });

  it("false when DATA_BACKEND=postgres (default backend, no store-node)", async () => {
    vi.resetModules();
    vi.stubEnv("DATA_BACKEND", "postgres");
    vi.stubEnv("SYNC_CLOUD_URL", "http://cloud.test");
    vi.stubEnv("LOCAL_DB_MASTER_KEY", "a-real-master-key-0123456789abcdef");

    const { shouldScheduleDrain } = await import("../drain-scheduler");
    expect(shouldScheduleDrain()).toBe(false);
  });

  it("false when SYNC_CLOUD_URL is unset (offline store-node — outbox accumulates)", async () => {
    vi.resetModules();
    vi.stubEnv("DATA_BACKEND", "sqlite");
    // SYNC_CLOUD_URL is `z.string().url().optional()` — an empty string
    // would fail URL validation, so "unset" means undefined, not "".
    vi.stubEnv("SYNC_CLOUD_URL", undefined);
    vi.stubEnv("LOCAL_DB_MASTER_KEY", "a-real-master-key-0123456789abcdef");

    const { shouldScheduleDrain } = await import("../drain-scheduler");
    expect(shouldScheduleDrain()).toBe(false);
  });

  it("false when LOCAL_DB_MASTER_KEY is unset (can't derive the local DB key)", async () => {
    vi.resetModules();
    vi.stubEnv("DATA_BACKEND", "sqlite");
    vi.stubEnv("SYNC_CLOUD_URL", "http://cloud.test");
    vi.stubEnv("LOCAL_DB_MASTER_KEY", "");

    const { shouldScheduleDrain } = await import("../drain-scheduler");
    expect(shouldScheduleDrain()).toBe(false);
  });
});

describe("startDrainScheduler (SN-3 Task 3)", () => {
  const masterKey = "a-real-master-key-0123456789abcdef";
  const deviceId = "test-scheduler-device";
  const syncTokenSecret = "test-sync-token-secret-change-me-0123456789";

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("drains immediately on start, then again after intervalMs; stop() clears the interval", async () => {
    vi.resetModules();
    vi.stubEnv("DATA_BACKEND", "sqlite");
    vi.stubEnv("SYNC_CLOUD_URL", "http://cloud.test");
    vi.stubEnv("LOCAL_DB_MASTER_KEY", masterKey);
    vi.stubEnv("SYNC_DEVICE_ID", deviceId);
    vi.stubEnv("SYNC_TOKEN_SECRET", syncTokenSecret);

    const { startDrainScheduler } = await import("../drain-scheduler");

    const drainImpl = vi.fn().mockResolvedValue({ pushed: 0, failed: 0 });
    // The scheduler shouldn't touch prisma directly beyond handing it to
    // drainImpl — a bare object is enough to prove that.
    const fakePrisma = { marker: "fake-prisma" } as never;

    const stop = startDrainScheduler(fakePrisma, { intervalMs: 1000, drainImpl });

    expect(drainImpl).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(drainImpl).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1000);
    expect(drainImpl).toHaveBeenCalledTimes(3);

    stop();

    await vi.advanceTimersByTimeAsync(5000);
    expect(drainImpl).toHaveBeenCalledTimes(3); // no more calls after stop
  });

  it("mints the token + derives the key from the configured values and passes them to drainImpl", async () => {
    vi.resetModules();
    vi.stubEnv("DATA_BACKEND", "sqlite");
    vi.stubEnv("SYNC_CLOUD_URL", "http://cloud.test");
    vi.stubEnv("LOCAL_DB_MASTER_KEY", masterKey);
    vi.stubEnv("SYNC_DEVICE_ID", deviceId);
    vi.stubEnv("SYNC_TOKEN_SECRET", syncTokenSecret);

    const { startDrainScheduler } = await import("../drain-scheduler");

    const drainImpl = vi.fn().mockResolvedValue({ pushed: 0, failed: 0 });
    const fakePrisma = {} as never;

    const stop = startDrainScheduler(fakePrisma, { intervalMs: 1000, drainImpl });
    stop();

    expect(drainImpl).toHaveBeenCalledTimes(1);
    const [prismaArg, deps] = drainImpl.mock.calls[0];
    expect(prismaArg).toBe(fakePrisma);
    expect(deps.cloudUrl).toBe("http://cloud.test");

    // Key: same derivation the scheduler should use internally.
    const expectedKey = deriveLocalDbKey(masterKey, deviceId);
    expect(Buffer.isBuffer(deps.key)).toBe(true);
    expect((deps.key as Buffer).equals(expectedKey)).toBe(true);

    // Token: a valid store-node JWT minted for this device (indirect
    // assertion — decode with the same secret rather than spying on
    // mintSyncToken directly).
    const decoded = jwt.verify(deps.token, syncTokenSecret) as {
      tenantId: string;
      storeId: string;
      deviceId: string;
      typ: string;
    };
    expect(decoded.deviceId).toBe(deviceId);
    expect(decoded.typ).toBe("store-node");
    expect(typeof decoded.tenantId).toBe("string");
    expect(typeof decoded.storeId).toBe("string");
  });

  it("guards the tick against a rejecting drainImpl — it must not throw or stop future ticks", async () => {
    vi.resetModules();
    vi.stubEnv("DATA_BACKEND", "sqlite");
    vi.stubEnv("SYNC_CLOUD_URL", "http://cloud.test");
    vi.stubEnv("LOCAL_DB_MASTER_KEY", masterKey);
    vi.stubEnv("SYNC_DEVICE_ID", deviceId);
    vi.stubEnv("SYNC_TOKEN_SECRET", syncTokenSecret);

    const { startDrainScheduler } = await import("../drain-scheduler");

    const drainImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const fakePrisma = {} as never;

    let stop: (() => void) | undefined;
    expect(() => {
      stop = startDrainScheduler(fakePrisma, { intervalMs: 1000, drainImpl });
    }).not.toThrow();

    expect(drainImpl).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(drainImpl).toHaveBeenCalledTimes(2);

    stop!();
  });
});
