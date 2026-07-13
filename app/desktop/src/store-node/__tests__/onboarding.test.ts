import type { SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deriveStoreNodeDbKey, ensureStoreNodeReady } from "../onboarding";
import type { StoreNodeSecrets } from "../store-node-config";

// Mirrors launcher.test.ts's FakeChild double: an EventEmitter with
// stdout/stderr streams, matching what the real one-shot's spawnFn/child
// stdio plumbing expects.
interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
}

function makeFakeChild(): FakeChild {
  const emitter = new EventEmitter() as unknown as FakeChild;
  emitter.stdout = new EventEmitter();
  emitter.stderr = new EventEmitter();
  return emitter;
}

const baseOpts = {
  dbPath: "C:/fake/userdata/store-node.db",
  key: Buffer.from("a".repeat(64), "hex"),
  backendDir: "C:/fake/rx-pos-backend",
  electronPath: "C:/fake/electron.exe",
  oneShotScriptPath: "C:/fake/scripts/push-sqlite-schema-oneshot.cjs",
};

const fakeSecrets: StoreNodeSecrets = {
  JWT_ACCESS_SECRET: "a".repeat(40),
  JWT_REFRESH_SECRET: "b".repeat(40),
  SYNC_TOKEN_SECRET: "c".repeat(40),
  LICENSE_TOKEN_SECRET: "d".repeat(40),
  PIN_PEPPER_SECRET: "e".repeat(40),
  POS_OVERRIDE_SECRET: "f".repeat(40),
  LOCAL_DB_MASTER_KEY: "g".repeat(40),
  SETUP_ACCESS_CODE: "h".repeat(40),
};

describe("ensureStoreNodeReady", () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("first run (no DB file): spawns the schema-push one-shot with the right argv/env, awaits exit 0, returns firstRun:true", async () => {
    dir = mkdtempSync(path.join(tmpdir(), "rxpos-onboarding-"));
    const dbPath = path.join(dir, "store-node.db"); // deliberately not created

    const child = makeFakeChild();
    const spawnFn = vi.fn(() => {
      queueMicrotask(() => child.emit("exit", 0, null));
      return child;
    });

    const result = await ensureStoreNodeReady({
      ...baseOpts,
      dbPath,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      spawnFn: spawnFn as any,
    });

    expect(result).toEqual({ firstRun: true });
    expect(spawnFn).toHaveBeenCalledTimes(1);

    const [electronPath, args, spawnOpts] = spawnFn.mock.calls[0] as unknown as [
      string,
      string[],
      SpawnOptions,
    ];
    expect(electronPath).toBe(baseOpts.electronPath);
    expect(args).toEqual([baseOpts.oneShotScriptPath]);
    expect(spawnOpts.cwd).toBe(baseOpts.backendDir);

    const env = spawnOpts.env!;
    expect(env.ELECTRON_RUN_AS_NODE).toBe("1");
    expect(env.RXPOS_PUSH_BACKEND_DIR).toBe(baseOpts.backendDir);
    expect(env.RXPOS_PUSH_DB_PATH).toBe(dbPath);
    expect(env.RXPOS_PUSH_DB_KEY_HEX).toBe(baseOpts.key.toString("hex"));
  });

  // SN-5 Task 3 (packaging-boot risk retirement): the one-shot's imported
  // module chain (sqlite-push.js -> sync-triggers.js -> config/database.js)
  // eagerly constructs a top-level Prisma singleton at require() time,
  // regardless of whether the push itself uses it — see onboarding.ts's
  // EnsureStoreNodeReadyOptions.secrets doc comment for the full story. In
  // dev this was silently satisfied by rx-pos-backend's own `.env` file
  // (DATABASE_URL placeholder + implicit dev secrets); a packaged build
  // ships no `.env`, so ensureStoreNodeReady must supply everything itself.
  it("always sets DATA_BACKEND=sqlite on the one-shot's env (packaged builds ship no backend .env to default it)", async () => {
    dir = mkdtempSync(path.join(tmpdir(), "rxpos-onboarding-"));
    const dbPath = path.join(dir, "store-node.db");

    const child = makeFakeChild();
    const spawnFn = vi.fn(() => {
      queueMicrotask(() => child.emit("exit", 0, null));
      return child;
    });

    await ensureStoreNodeReady({
      ...baseOpts,
      dbPath,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      spawnFn: spawnFn as any,
    });

    const [, , spawnOpts] = spawnFn.mock.calls[0] as unknown as [
      string,
      string[],
      SpawnOptions,
    ];
    expect(spawnOpts.env!.DATA_BACKEND).toBe("sqlite");
  });

  it("merges `secrets` into the one-shot's env when supplied (satisfies the backend's config schema validation)", async () => {
    dir = mkdtempSync(path.join(tmpdir(), "rxpos-onboarding-"));
    const dbPath = path.join(dir, "store-node.db");

    const child = makeFakeChild();
    const spawnFn = vi.fn(() => {
      queueMicrotask(() => child.emit("exit", 0, null));
      return child;
    });

    await ensureStoreNodeReady({
      ...baseOpts,
      dbPath,
      secrets: fakeSecrets,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      spawnFn: spawnFn as any,
    });

    const [, , spawnOpts] = spawnFn.mock.calls[0] as unknown as [
      string,
      string[],
      SpawnOptions,
    ];
    const env = spawnOpts.env!;
    expect(env.JWT_ACCESS_SECRET).toBe(fakeSecrets.JWT_ACCESS_SECRET);
    expect(env.JWT_REFRESH_SECRET).toBe(fakeSecrets.JWT_REFRESH_SECRET);
    expect(env.SYNC_TOKEN_SECRET).toBe(fakeSecrets.SYNC_TOKEN_SECRET);
    expect(env.LICENSE_TOKEN_SECRET).toBe(fakeSecrets.LICENSE_TOKEN_SECRET);
    expect(env.PIN_PEPPER_SECRET).toBe(fakeSecrets.PIN_PEPPER_SECRET);
    expect(env.POS_OVERRIDE_SECRET).toBe(fakeSecrets.POS_OVERRIDE_SECRET);
    expect(env.LOCAL_DB_MASTER_KEY).toBe(fakeSecrets.LOCAL_DB_MASTER_KEY);
  });

  it("omits secrets from the one-shot's env when not supplied (backward compatible with existing callers)", async () => {
    dir = mkdtempSync(path.join(tmpdir(), "rxpos-onboarding-"));
    const dbPath = path.join(dir, "store-node.db");

    const child = makeFakeChild();
    const spawnFn = vi.fn(() => {
      queueMicrotask(() => child.emit("exit", 0, null));
      return child;
    });

    await ensureStoreNodeReady({
      ...baseOpts,
      dbPath,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      spawnFn: spawnFn as any,
    });

    const [, , spawnOpts] = spawnFn.mock.calls[0] as unknown as [
      string,
      string[],
      SpawnOptions,
    ];
    expect(spawnOpts.env!.JWT_ACCESS_SECRET).toBeUndefined();
  });

  it("second run (DB file already exists): does NOT spawn, returns firstRun:false", async () => {
    dir = mkdtempSync(path.join(tmpdir(), "rxpos-onboarding-"));
    const dbPath = path.join(dir, "store-node.db");
    writeFileSync(dbPath, ""); // simulate an already-onboarded store-node

    const spawnFn = vi.fn();

    const result = await ensureStoreNodeReady({
      ...baseOpts,
      dbPath,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      spawnFn: spawnFn as any,
    });

    expect(result).toEqual({ firstRun: false });
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it("is idempotent: calling it twice on the same (now-created) path only pushes once", async () => {
    dir = mkdtempSync(path.join(tmpdir(), "rxpos-onboarding-"));
    const dbPath = path.join(dir, "store-node.db");

    let existsCalls = 0;
    const existsFn = (): boolean => {
      existsCalls += 1;
      // First call (first ensureStoreNodeReady): file doesn't exist yet.
      // Every call after the push "creates" it: simulate via a flag.
      return existsCalls > 1;
    };

    const child = makeFakeChild();
    const spawnFn = vi.fn(() => {
      queueMicrotask(() => child.emit("exit", 0, null));
      return child;
    });

    const first = await ensureStoreNodeReady({
      ...baseOpts,
      dbPath,
      existsFn,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      spawnFn: spawnFn as any,
    });
    const second = await ensureStoreNodeReady({
      ...baseOpts,
      dbPath,
      existsFn,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      spawnFn: spawnFn as any,
    });

    expect(first).toEqual({ firstRun: true });
    expect(second).toEqual({ firstRun: false });
    expect(spawnFn).toHaveBeenCalledTimes(1);
  });

  it("rejects with a clear error when the push one-shot exits non-zero, and does not swallow it", async () => {
    dir = mkdtempSync(path.join(tmpdir(), "rxpos-onboarding-"));
    const dbPath = path.join(dir, "store-node.db");

    const child = makeFakeChild();
    const spawnFn = vi.fn(() => {
      queueMicrotask(() => child.emit("exit", 1, null));
      return child;
    });

    await expect(
      ensureStoreNodeReady({
        ...baseOpts,
        dbPath,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        spawnFn: spawnFn as any,
      }),
    ).rejects.toThrow(/schema push exited with code 1/);
  });

  describe("electronNativeOverride (WATCH-SN4-1, mirrors launcher.ts)", () => {
    it("injects --require + the entry env var when both override paths exist", async () => {
      dir = mkdtempSync(path.join(tmpdir(), "rxpos-onboarding-"));
      const dbPath = path.join(dir, "store-node.db");

      const child = makeFakeChild();
      const spawnFn = vi.fn(() => {
        queueMicrotask(() => child.emit("exit", 0, null));
        return child;
      });

      await ensureStoreNodeReady({
        ...baseOpts,
        dbPath,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        spawnFn: spawnFn as any,
        // dbPath itself must read as NOT existing (first run); the override
        // paths must read as existing.
        existsFn: (p: string) => p !== dbPath,
        electronNativeOverride: {
          hookPath: "C:/fake/hook.cjs",
          sqlcipherEntry: "C:/fake/native/better-sqlite3-multiple-ciphers",
        },
      });

      const [, args, spawnOpts] = spawnFn.mock.calls[0] as unknown as [
        string,
        string[],
        SpawnOptions,
      ];
      expect(args).toEqual(["--require", "C:/fake/hook.cjs", baseOpts.oneShotScriptPath]);
      expect(spawnOpts.env!.RXPOS_NATIVE_SQLCIPHER_ENTRY).toBe(
        "C:/fake/native/better-sqlite3-multiple-ciphers",
      );
    });

    it("skips the override entirely when the hook/entry paths don't exist", async () => {
      dir = mkdtempSync(path.join(tmpdir(), "rxpos-onboarding-"));
      const dbPath = path.join(dir, "store-node.db");

      const child = makeFakeChild();
      const spawnFn = vi.fn(() => {
        queueMicrotask(() => child.emit("exit", 0, null));
        return child;
      });

      await ensureStoreNodeReady({
        ...baseOpts,
        dbPath,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        spawnFn: spawnFn as any,
        existsFn: () => false, // DB file "doesn't exist" (first run) AND override paths don't exist
        electronNativeOverride: {
          hookPath: "C:/fake/hook.cjs",
          sqlcipherEntry: "C:/fake/native/better-sqlite3-multiple-ciphers",
        },
      });

      const [, args, spawnOpts] = spawnFn.mock.calls[0] as unknown as [
        string,
        string[],
        SpawnOptions,
      ];
      expect(args).toEqual([baseOpts.oneShotScriptPath]);
      expect(spawnOpts.env!.RXPOS_NATIVE_SQLCIPHER_ENTRY).toBeUndefined();
    });
  });
});

describe("deriveStoreNodeDbKey", () => {
  it("matches the backend's OWN deriveLocalDbKey for the same inputs (guards against a silent key mismatch)", () => {
    // Requires the real rx-pos-backend build output (dist/local/key-derivation.js)
    // — present because rx-pos-backend/npm run build must have run for the
    // desktop app to work at all (launcher.ts throws otherwise). Resolved as
    // a sibling repo the same way launcher.ts's defaultBackendDir() does.
    const backendDir = path.resolve(process.cwd(), "..", "rx-pos-backend");

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { deriveLocalDbKey } = require(
      path.join(backendDir, "dist", "local", "key-derivation.js"),
    ) as { deriveLocalDbKey: (masterKey: string, deviceId: string) => Buffer };

    const masterKey = "test-master-key-1234567890";
    const expected = deriveLocalDbKey(masterKey, "dev-device-0001");

    const actual = deriveStoreNodeDbKey({ backendDir, masterKey });

    expect(actual.equals(expected)).toBe(true);
  });
});
