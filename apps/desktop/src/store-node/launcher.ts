// SN-4 Task 2: spawns the store-node (rx-pos-backend) as a local child
// process under Electron-as-node, health-gates it, and hands the caller
// (main.ts) the port it's listening on + a stop() to shut it down cleanly.
//
// Electron binary resolution: the default `electronPath` is `process.execPath`,
// NOT `require("electron")`. Verified empirically during this task: `require`ing
// the "electron" module from CODE RUNNING INSIDE THE REAL ELECTRON MAIN PROCESS
// (i.e. main.ts, not run under ELECTRON_RUN_AS_NODE) returns Electron's API
// object ({ app, BrowserWindow, ... }) — Electron intercepts "electron" as a
// builtin in that context, it never falls through to node_modules/electron's
// path-string trick. That trick only fires when the *requiring* process is
// plain Node (e.g. scripts/verify-native-runner.mjs, run via `node ...`) or
// already under ELECTRON_RUN_AS_NODE. Since startStoreNode() runs from inside
// the normal (non-run-as-node) main process, `process.execPath` — which IS the
// electron.exe path whenever the current process is Electron — is the correct,
// context-independent way to get the binary to spawn-as-node. `electronPath` is
// still fully injectable for tests and for any future context that needs it.
import {
  type ChildProcess,
  execFileSync,
  spawn as nodeSpawn,
} from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import {
  loadOrCreateStoreNodeSecrets,
  STORE_NODE_DEVICE_ID,
  type StoreNodeSecrets,
} from "./store-node-config";

export interface StoreNodeHandle {
  port: number;
  stop: () => Promise<void>;
  /**
   * SN-4 final-review data-safety fix. Synchronous, best-effort hard-kill of
   * the store-node child. Use ONLY on a path that calls `app.exit()`
   * directly (currently: main.ts's crash-relaunch `onCrash` handler) — call
   * it immediately BEFORE `app.exit()`.
   *
   * Why this exists: `app.exit()` does NOT fire "before-quit", so the
   * normal async `stop()` (SIGTERM -> grace window -> SIGKILL, all awaited)
   * never gets a chance to run before the process dies. The spawned child
   * is not attached to a Windows job object either, so it can survive as an
   * ORPHAN still holding the encrypted `store-node.db` (SQLCipher WAL)
   * open. The next launch's `ensureStoreNodeReady` no-ops (the file already
   * exists) and `startStoreNode` spawns a SECOND server on the SAME
   * encrypted DB file -> "database is locked" / corruption risk.
   *
   * `killNow()` closes that window: it sends SIGKILL synchronously (no
   * await, no event loop turn required) and, best-effort, force-kills the
   * process (+ tree, on Windows) by pid too, so the child is provably dead
   * before `app.exit()` runs. Safe to call multiple times and after the
   * child has already exited. Do NOT use this on the normal-quit path —
   * `before-quit` + the existing async `stop()` is correct there (gives the
   * backend's own SIGTERM handler a chance to drain/close cleanly).
   */
  killNow: () => void;
}

export interface StartStoreNodeOptions {
  /**
   * Path to the backend's compiled entry point (`dist/server.js`, produced by
   * `rx-pos-backend`'s `npm run build`). Injectable so SN-5 can point this at
   * the packaged `extraResources` copy instead — nothing else about the
   * launcher changes for that swap.
   */
  backendEntry?: string;
  /** cwd the child is spawned with, so its own relative paths/.env resolve. */
  backendCwd?: string;
  /** Where the secrets file + encrypted DB file live. main.ts always passes `app.getPath("userData")`. */
  userDataDir?: string;
  /** Force a specific port instead of probing a free one (mainly for tests). */
  port?: number;
  /** Electron binary to spawn-as-node. Defaults to `process.execPath` — see file header. */
  electronPath?: string;
  /** Base env merged under the launcher's required overrides + secrets. Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  /**
   * WATCH-SN4-1 fix (see scripts/rebuild-native-backend.mjs +
   * scripts/electron-native-require-hook.cjs): the backend's own
   * `better-sqlite3-multiple-ciphers` is built for plain Node, not the
   * Electron ABI the child runs under. When BOTH paths below exist, the
   * launcher injects `--require <hookPath>` and points it at
   * `sqlcipherEntry` (a private, Electron-targeted copy of the module) via
   * env — redirecting only that one module's resolution for this child.
   * When either is missing/omitted, the flag is skipped entirely (the
   * backend then either happens to work anyway, e.g. a stub with no native
   * deps, or fails with a clear ABI-mismatch error at boot).
   */
  electronNativeOverride?: { hookPath: string; sqlcipherEntry: string };
  spawnFn?: typeof nodeSpawn;
  fetchFn?: typeof fetch;
  existsFn?: (p: string) => boolean;
  getFreePortFn?: () => Promise<number>;
  getSecretsFn?: (userDataDir: string) => StoreNodeSecrets;
  healthTimeoutMs?: number;
  healthPollIntervalMs?: number;
  onLog?: (line: string) => void;
}

const DEFAULT_HEALTH_TIMEOUT_MS = 30_000;
const DEFAULT_HEALTH_POLL_INTERVAL_MS = 300;
const DEFAULT_STOP_GRACE_MS = 5_000;

// Dev convenience only. main.ts always passes `backendEntry`/`backendCwd`
// explicitly (derived from `app.getAppPath()`), which stays correct once
// SN-5 repoints it at a packaged resource. This fallback just assumes the
// desktop app's cwd is `rx-pos-desktop` (true for `npm start` / `electron .`)
// with `rx-pos-backend` as a sibling directory — handy for a quick harness.
function defaultBackendDir(): string {
  return path.resolve(process.cwd(), "..", "backend");
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      const port = typeof address === "object" && address ? address.port : undefined;
      srv.close(() => {
        if (port) resolve(port);
        else reject(new Error("startStoreNode: failed to determine a free port"));
      });
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The single physical DB file path, derived the same way in every caller
// (startStoreNode below, AND main.ts's onboarding.ts call, which must agree
// on this path so `ensureStoreNodeReady` checks/creates the exact file the
// spawned server then opens). Exported so main.ts never re-derives it ad hoc.
export function storeNodeDbPath(userDataDir: string): string {
  return path.join(userDataDir, "store-node.db");
}

async function waitForHealth(opts: {
  port: number;
  fetchFn: typeof fetch;
  timeoutMs: number;
  pollIntervalMs: number;
  isExited: () => boolean;
  getExitError: () => Error | undefined;
}): Promise<void> {
  const url = `http://127.0.0.1:${opts.port}/api/health`;
  const deadline = Date.now() + opts.timeoutMs;

  for (;;) {
    if (opts.isExited()) {
      throw (
        opts.getExitError() ??
        new Error("startStoreNode: backend process exited before becoming healthy")
      );
    }
    try {
      const res = await opts.fetchFn(url);
      if (res.ok) return;
    } catch {
      // Not listening yet (ECONNREFUSED etc.) — keep polling.
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `startStoreNode: backend did not become healthy within ${opts.timeoutMs}ms (GET ${url})`,
      );
    }
    await sleep(opts.pollIntervalMs);
  }
}

function killChild(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    // Boxed in an object (rather than a bare `let`) so it can be declared
    // before kill() runs and assigned after, without tripping
    // `prefer-const` — a fake/synchronous child in tests can emit "exit"
    // from inside kill() itself, so `onExit` must not reference the timer
    // before it's assigned (a TDZ bug if declared with `const` after).
    const forceTimer: { handle: NodeJS.Timeout | undefined } = { handle: undefined };
    const onExit = (): void => {
      if (forceTimer.handle) clearTimeout(forceTimer.handle);
      resolve();
    };
    child.once("exit", onExit);
    child.kill("SIGTERM");
    // On Windows there's no real signal delivery, so SIGTERM already acts as
    // a forceful terminate; on POSIX give the process a grace window to shut
    // down cleanly (rx-pos-backend/src/server.ts's own SIGTERM handler
    // drains connections / closes the DB) before escalating to SIGKILL so
    // `stop()` can never hang indefinitely.
    forceTimer.handle = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // process already gone
      }
    }, DEFAULT_STOP_GRACE_MS);
  });
}

// Synchronous counterpart to killChild(), for the crash-relaunch path (see
// StoreNodeHandle.killNow doc comment). Deliberately does NOT wait for the
// "exit" event — the whole point is to not need an event-loop turn / await
// before app.exit() runs. Guarded so it's safe to call when the child is
// already gone (double-call, or the child happened to exit on its own).
function killChildSync(child: ChildProcess): void {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const pid = child.pid;
  try {
    child.kill("SIGKILL");
  } catch {
    // Process already gone (e.g. TOCTOU race with a natural exit) — fine.
  }
  if (pid === undefined) return;
  if (process.platform === "win32") {
    // `child.kill("SIGKILL")` on Windows maps to TerminateProcess() on the
    // immediate child only — it does not reap any grandchildren the
    // store-node process may have spun up, and isn't guaranteed to land if
    // the child is mid-startup. `taskkill /T /F` force-kills the whole
    // process tree by pid and is synchronous (execFileSync blocks until
    // done), so by the time this function returns the tree is confirmed
    // gone. Best-effort: swallow failures (process/tree already gone,
    // taskkill unavailable, etc.) — this must never throw into onCrash.
    try {
      execFileSync("taskkill", ["/pid", String(pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } catch {
      // best-effort
    }
  } else {
    // POSIX: also signal the pid directly as a belt-and-suspenders measure
    // in case child.kill() above didn't actually reach the process (e.g.
    // it was already reparented/detached).
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // best-effort — already gone
    }
  }
}

export async function startStoreNode(
  opts: StartStoreNodeOptions = {},
): Promise<StoreNodeHandle> {
  const spawnFn = opts.spawnFn ?? nodeSpawn;
  const fetchFn = opts.fetchFn ?? fetch;
  const existsFn = opts.existsFn ?? existsSync;
  const getFreePortFn = opts.getFreePortFn ?? getFreePort;
  const getSecretsFn = opts.getSecretsFn ?? loadOrCreateStoreNodeSecrets;
  const healthTimeoutMs = opts.healthTimeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS;
  const healthPollIntervalMs = opts.healthPollIntervalMs ?? DEFAULT_HEALTH_POLL_INTERVAL_MS;
  const onLog = opts.onLog ?? (() => {});
  const baseEnv = opts.env ?? process.env;

  const backendCwd = opts.backendCwd ?? defaultBackendDir();
  const backendEntry = opts.backendEntry ?? path.join(backendCwd, "dist", "server.js");
  const userDataDir = opts.userDataDir ?? path.join(os.tmpdir(), "rxpos-store-node");
  const electronPath = opts.electronPath ?? process.execPath;

  if (!existsFn(backendEntry)) {
    throw new Error(
      `startStoreNode: backend entry not found at "${backendEntry}". Build it first: ` +
        `cd rx-pos-backend && npm run build (tsc + tsc-alias -> dist/server.js).`,
    );
  }

  const port = opts.port ?? (await getFreePortFn());
  const secrets = getSecretsFn(userDataDir);

  const env: NodeJS.ProcessEnv = {
    ...baseEnv,
    ELECTRON_RUN_AS_NODE: "1",
    DATA_BACKEND: "sqlite",
    LOCAL_DB_PATH: storeNodeDbPath(userDataDir),
    PORT: String(port),
    NODE_ENV: "production",
    JWT_ACCESS_SECRET: secrets.JWT_ACCESS_SECRET,
    JWT_REFRESH_SECRET: secrets.JWT_REFRESH_SECRET,
    SYNC_TOKEN_SECRET: secrets.SYNC_TOKEN_SECRET,
    LICENSE_TOKEN_SECRET: secrets.LICENSE_TOKEN_SECRET,
    PIN_PEPPER_SECRET: secrets.PIN_PEPPER_SECRET,
    POS_OVERRIDE_SECRET: secrets.POS_OVERRIDE_SECRET,
    LOCAL_DB_MASTER_KEY: secrets.LOCAL_DB_MASTER_KEY,
    // Explicit, not relied-on-as-default: must match the deviceId
    // onboarding.ts used to derive the SQLCipher key BEFORE this server ever
    // boots (see STORE_NODE_DEVICE_ID's doc comment in store-node-config.ts).
    SYNC_DEVICE_ID: STORE_NODE_DEVICE_ID,
    // Unlocks POST /api/v1/setup/complete (see StoreNodeSecrets.SETUP_ACCESS_CODE
    // doc comment) — without this the backend's own first-run setup refuses
    // every request with "Initial setup is locked".
    SETUP_ACCESS_CODE: secrets.SETUP_ACCESS_CODE,
  };

  const nativeOverride = opts.electronNativeOverride;
  const useNativeOverride =
    !!nativeOverride &&
    existsFn(nativeOverride.hookPath) &&
    existsFn(nativeOverride.sqlcipherEntry);
  if (useNativeOverride) {
    env.RXPOS_NATIVE_SQLCIPHER_ENTRY = nativeOverride.sqlcipherEntry;
  }
  const childArgs = useNativeOverride
    ? ["--require", nativeOverride.hookPath, backendEntry]
    : [backendEntry];

  const child = spawnFn(electronPath, childArgs, {
    cwd: backendCwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout?.on("data", (chunk: Buffer) => onLog(`[store-node] ${chunk.toString().trimEnd()}`));
  child.stderr?.on("data", (chunk: Buffer) =>
    onLog(`[store-node:err] ${chunk.toString().trimEnd()}`),
  );

  let exited = false;
  let exitError: Error | undefined;
  child.once("exit", (code, signal) => {
    exited = true;
    if (code !== 0 && code !== null) {
      exitError = new Error(
        `startStoreNode: backend process exited early with code ${code} (signal ${signal ?? "none"})`,
      );
    }
  });
  child.once("error", (err) => {
    exited = true;
    exitError = err;
  });

  try {
    await waitForHealth({
      port,
      fetchFn,
      timeoutMs: healthTimeoutMs,
      pollIntervalMs: healthPollIntervalMs,
      isExited: () => exited,
      getExitError: () => exitError,
    });
  } catch (err) {
    await killChild(child);
    throw err;
  }

  let stopped = false;
  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    await killChild(child);
  };
  const killNow = (): void => {
    if (stopped) return;
    stopped = true;
    killChildSync(child);
  };

  return { port, stop, killNow };
}
