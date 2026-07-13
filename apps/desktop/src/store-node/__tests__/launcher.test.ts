import type { SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { startStoreNode } from "../launcher";
import type { StoreNodeSecrets } from "../store-node-config";

// A minimal ChildProcess double: an EventEmitter with stdout/stderr streams
// and a kill() that synchronously fires "exit", mirroring how the real
// launcher's killChild() awaits the child's "exit" event.
interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  exitCode: number | null;
  signalCode: string | null;
  kill: ReturnType<typeof vi.fn>;
}

function makeFakeChild(): FakeChild {
  const emitter = new EventEmitter() as unknown as FakeChild;
  emitter.stdout = new EventEmitter();
  emitter.stderr = new EventEmitter();
  emitter.exitCode = null;
  emitter.signalCode = null;
  emitter.kill = vi.fn((signal?: string) => {
    emitter.exitCode = 0;
    emitter.signalCode = signal ?? "SIGTERM";
    emitter.emit("exit", 0, signal ?? "SIGTERM");
    return true;
  });
  return emitter;
}

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

const baseOpts = {
  backendEntry: "C:/fake/dist/server.js",
  backendCwd: "C:/fake",
  userDataDir: "C:/fake/userdata",
  electronPath: "C:/fake/electron.exe",
  existsFn: () => true,
  getSecretsFn: () => fakeSecrets,
};

describe("startStoreNode", () => {
  it("spawns electron-as-node with the right argv + env, and resolves once /api/health is ok", async () => {
    const child = makeFakeChild();
    const spawnFn = vi.fn(() => child);
    let calls = 0;
    const fetchFn = vi.fn(async (url: string) => {
      calls += 1;
      expect(url).toBe("http://127.0.0.1:5555/api/health");
      if (calls < 3) throw new Error("ECONNREFUSED");
      return { ok: true } as Response;
    });

    const handle = await startStoreNode({
      ...baseOpts,
      port: 5555,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      spawnFn: spawnFn as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fetchFn: fetchFn as any,
      healthPollIntervalMs: 1,
    });

    expect(handle.port).toBe(5555);
    expect(fetchFn).toHaveBeenCalledTimes(3);

    expect(spawnFn).toHaveBeenCalledTimes(1);
    const [electronPath, args, spawnOpts] = spawnFn.mock.calls[0] as unknown as [
      string,
      string[],
      SpawnOptions,
    ];
    expect(electronPath).toBe("C:/fake/electron.exe");
    expect(args).toEqual(["C:/fake/dist/server.js"]);
    expect(spawnOpts.cwd).toBe("C:/fake");
    const env = spawnOpts.env!;
    expect(env.ELECTRON_RUN_AS_NODE).toBe("1");
    expect(env.DATA_BACKEND).toBe("sqlite");
    expect(env.PORT).toBe("5555");
    expect(env.NODE_ENV).toBe("production");
    expect(env.LOCAL_DB_PATH).toContain("userdata");
    expect(env.JWT_ACCESS_SECRET).toBe(fakeSecrets.JWT_ACCESS_SECRET);
    expect(env.JWT_REFRESH_SECRET).toBe(fakeSecrets.JWT_REFRESH_SECRET);
    expect(env.SYNC_TOKEN_SECRET).toBe(fakeSecrets.SYNC_TOKEN_SECRET);
    expect(env.LICENSE_TOKEN_SECRET).toBe(fakeSecrets.LICENSE_TOKEN_SECRET);
    expect(env.PIN_PEPPER_SECRET).toBe(fakeSecrets.PIN_PEPPER_SECRET);
    expect(env.POS_OVERRIDE_SECRET).toBe(fakeSecrets.POS_OVERRIDE_SECRET);
    expect(env.LOCAL_DB_MASTER_KEY).toBe(fakeSecrets.LOCAL_DB_MASTER_KEY);
    expect(env.SETUP_ACCESS_CODE).toBe(fakeSecrets.SETUP_ACCESS_CODE);
    expect(env.SYNC_DEVICE_ID).toBe("dev-device-0001");

    await handle.stop();
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("probes a free port when none is given", async () => {
    const child = makeFakeChild();
    const spawnFn = vi.fn(() => child);
    const fetchFn = vi.fn(async () => ({ ok: true }) as Response);
    const getFreePortFn = vi.fn(async () => 6001);

    const handle = await startStoreNode({
      ...baseOpts,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      spawnFn: spawnFn as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fetchFn: fetchFn as any,
      getFreePortFn,
    });

    expect(getFreePortFn).toHaveBeenCalledTimes(1);
    expect(handle.port).toBe(6001);
    await handle.stop();
  });

  it("rejects with a clear error when health never comes up, and cleans up the child", async () => {
    const child = makeFakeChild();
    const spawnFn = vi.fn(() => child);
    const fetchFn = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });

    await expect(
      startStoreNode({
        ...baseOpts,
        port: 5556,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        spawnFn: spawnFn as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fetchFn: fetchFn as any,
        healthTimeoutMs: 20,
        healthPollIntervalMs: 5,
      }),
    ).rejects.toThrow(/did not become healthy/);

    expect(child.kill).toHaveBeenCalled();
  });

  it("rejects immediately (without waiting out the timeout) if the child exits early", async () => {
    const child = makeFakeChild();
    const spawnFn = vi.fn(() => {
      // Simulate the process dying right after spawn (e.g. a crash on boot).
      queueMicrotask(() => child.emit("exit", 1, null));
      return child;
    });
    const fetchFn = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });

    await expect(
      startStoreNode({
        ...baseOpts,
        port: 5558,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        spawnFn: spawnFn as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fetchFn: fetchFn as any,
        healthTimeoutMs: 30_000,
        healthPollIntervalMs: 5,
      }),
    ).rejects.toThrow(/exited early with code 1/);
  });

  it("throws a clear error when the backend entry point is missing", async () => {
    await expect(
      startStoreNode({
        ...baseOpts,
        existsFn: () => false,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        spawnFn: vi.fn() as any,
      }),
    ).rejects.toThrow(/backend entry not found/);
  });

  it("stop() sends SIGTERM to the child and awaits its exit", async () => {
    const child = makeFakeChild();
    const spawnFn = vi.fn(() => child);
    const fetchFn = vi.fn(async () => ({ ok: true }) as Response);

    const handle = await startStoreNode({
      ...baseOpts,
      port: 5557,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      spawnFn: spawnFn as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fetchFn: fetchFn as any,
    });

    await handle.stop();

    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");

    // Calling stop() again is a no-op (doesn't kill twice).
    await handle.stop();
    expect(child.kill).toHaveBeenCalledTimes(1);
  });

  describe("killNow() — SN-4 final review data-safety fix", () => {
    it("synchronously SIGKILLs the child (no await needed for the kill call itself)", async () => {
      const child = makeFakeChild();
      // Override kill() here so it does NOT auto-emit "exit" the way
      // makeFakeChild()'s default does — this proves killNow() doesn't rely
      // on (or wait for) the "exit" event to have already fired.
      child.kill = vi.fn(() => {
        child.exitCode = null;
        child.signalCode = null;
        return true;
      });
      const spawnFn = vi.fn(() => child);
      const fetchFn = vi.fn(async () => ({ ok: true }) as Response);

      const handle = await startStoreNode({
        ...baseOpts,
        port: 5561,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        spawnFn: spawnFn as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fetchFn: fetchFn as any,
      });

      // Synchronous call — no `await`. If this were async-only, the
      // assertion right below would race the real implementation.
      handle.killNow();

      expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    });

    it("is safe to call twice (does not kill twice)", async () => {
      const child = makeFakeChild();
      const spawnFn = vi.fn(() => child);
      const fetchFn = vi.fn(async () => ({ ok: true }) as Response);

      const handle = await startStoreNode({
        ...baseOpts,
        port: 5562,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        spawnFn: spawnFn as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fetchFn: fetchFn as any,
      });

      handle.killNow();
      expect(child.kill).toHaveBeenCalledTimes(1);

      handle.killNow();
      expect(child.kill).toHaveBeenCalledTimes(1);
      expect(() => handle.killNow()).not.toThrow();
    });

    it("is safe to call after the child has already exited on its own, and never throws", async () => {
      const child = makeFakeChild();
      const spawnFn = vi.fn(() => child);
      const fetchFn = vi.fn(async () => ({ ok: true }) as Response);

      const handle = await startStoreNode({
        ...baseOpts,
        port: 5563,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        spawnFn: spawnFn as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fetchFn: fetchFn as any,
      });

      // Simulate the child already having exited by itself before killNow()
      // is ever invoked (e.g. it crashed independently).
      child.exitCode = 0;
      child.signalCode = null;

      expect(() => handle.killNow()).not.toThrow();
      expect(child.kill).not.toHaveBeenCalled();
    });

    it("does not also trigger stop()'s SIGTERM path once killNow() has run", async () => {
      const child = makeFakeChild();
      const spawnFn = vi.fn(() => child);
      const fetchFn = vi.fn(async () => ({ ok: true }) as Response);

      const handle = await startStoreNode({
        ...baseOpts,
        port: 5564,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        spawnFn: spawnFn as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fetchFn: fetchFn as any,
      });

      handle.killNow();
      expect(child.kill).toHaveBeenCalledWith("SIGKILL");
      expect(child.kill).toHaveBeenCalledTimes(1);

      // stop() (the normal-quit async path) must be a no-op after killNow()
      // already tore the child down — it must NOT re-kill with SIGTERM.
      await handle.stop();
      expect(child.kill).toHaveBeenCalledTimes(1);
    });
  });

  describe("electronNativeOverride (WATCH-SN4-1)", () => {
    it("injects --require + the entry env var when both override paths exist", async () => {
      const child = makeFakeChild();
      const spawnFn = vi.fn(() => child);
      const fetchFn = vi.fn(async () => ({ ok: true }) as Response);

      const handle = await startStoreNode({
        ...baseOpts,
        port: 5559,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        spawnFn: spawnFn as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fetchFn: fetchFn as any,
        existsFn: () => true, // both backendEntry AND the override paths "exist"
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
      expect(args).toEqual([
        "--require",
        "C:/fake/hook.cjs",
        "C:/fake/dist/server.js",
      ]);
      expect(spawnOpts.env!.RXPOS_NATIVE_SQLCIPHER_ENTRY).toBe(
        "C:/fake/native/better-sqlite3-multiple-ciphers",
      );

      await handle.stop();
    });

    it("skips the override entirely when the hook/entry paths don't exist", async () => {
      const child = makeFakeChild();
      const spawnFn = vi.fn(() => child);
      const fetchFn = vi.fn(async () => ({ ok: true }) as Response);

      const handle = await startStoreNode({
        ...baseOpts,
        port: 5560,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        spawnFn: spawnFn as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fetchFn: fetchFn as any,
        // backendEntry exists, but the override paths don't.
        existsFn: (p: string) => p === baseOpts.backendEntry,
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
      expect(args).toEqual(["C:/fake/dist/server.js"]);
      expect(spawnOpts.env!.RXPOS_NATIVE_SQLCIPHER_ENTRY).toBeUndefined();

      await handle.stop();
    });
  });
});
