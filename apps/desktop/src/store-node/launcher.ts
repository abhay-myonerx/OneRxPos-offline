// Spawns the RX POS Store Node backend as a local child process under
// Electron-as-Node.
//
// The Store Node is health-gated before the renderer opens.
//
// Device identity is supplied explicitly by main.ts. The same deviceId is used
// by onboarding.ts for SQLCipher key derivation and here as SYNC_DEVICE_ID.

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
  type StoreNodeSecrets,
} from "./store-node-config";

export interface StoreNodeHandle {
  port: number;

  stop: () => Promise<void>;

  /**
   * Synchronous best-effort Store Node termination.
   *
   * Used by the crash-relaunch path because Electron app.exit() does not fire
   * before-quit. This prevents an orphan Store Node process from keeping the
   * encrypted SQLite database/WAL open.
   */
  killNow: () => void;
}

export interface StartStoreNodeOptions {
  /**
   * Real RX POS device fingerprint.
   *
   * Required so the Store Node uses the same device identity that was used for
   * SQLCipher key derivation.
   */
  deviceId: string;

  /**
   * Backend compiled/bundled entry point.
   */
  backendEntry?: string;

  /**
   * Child process cwd.
   */
  backendCwd?: string;

  /**
   * Electron userData directory.
   */
  userDataDir?: string;

  /**
   * Force a port, mainly for tests.
   */
  port?: number;

  /**
   * Electron binary.
   */
  electronPath?: string;

  /**
   * Base child environment.
   */
  env?: NodeJS.ProcessEnv;

  /**
   * Electron ABI-compatible SQLCipher module override.
   */
  electronNativeOverride?: {
    hookPath: string;
    sqlcipherEntry: string;
  };

  spawnFn?: typeof nodeSpawn;
  fetchFn?: typeof fetch;
  existsFn?: (p: string) => boolean;
  getFreePortFn?: () => Promise<number>;

  getSecretsFn?: (
    userDataDir: string,
  ) => StoreNodeSecrets;

  healthTimeoutMs?: number;
  healthPollIntervalMs?: number;

  onLog?: (line: string) => void;
}

const DEFAULT_HEALTH_TIMEOUT_MS =
  30_000;

const DEFAULT_HEALTH_POLL_INTERVAL_MS =
  300;

const DEFAULT_STOP_GRACE_MS =
  5_000;

function defaultBackendDir(): string {
  return path.resolve(
    process.cwd(),
    "..",
    "backend",
  );
}

function getFreePort(): Promise<number> {
  return new Promise(
    (resolve, reject) => {
      const srv = createServer();

      srv.unref();

      srv.on(
        "error",
        reject,
      );

      srv.listen(
        0,
        "127.0.0.1",
        () => {
          const address =
            srv.address();

          const port =
            typeof address === "object" &&
            address
              ? address.port
              : undefined;

          srv.close(() => {
            if (port) {
              resolve(port);

              return;
            }

            reject(
              new Error(
                "startStoreNode: failed to determine a free port",
              ),
            );
          });
        },
      );
    },
  );
}

function sleep(
  ms: number,
): Promise<void> {
  return new Promise(
    (resolve) =>
      setTimeout(resolve, ms),
  );
}

export function storeNodeDbPath(
  userDataDir: string,
): string {
  return path.join(
    userDataDir,
    "store-node.db",
  );
}

async function waitForHealth(opts: {
  port: number;
  fetchFn: typeof fetch;
  timeoutMs: number;
  pollIntervalMs: number;
  isExited: () => boolean;
  getExitError: () => Error | undefined;
}): Promise<void> {
  const url =
    `http://127.0.0.1:${opts.port}/api/health`;

  const deadline =
    Date.now() + opts.timeoutMs;

  for (;;) {
    if (opts.isExited()) {
      throw (
        opts.getExitError() ??
        new Error(
          "startStoreNode: backend process exited before becoming healthy",
        )
      );
    }

    try {
      const res =
        await opts.fetchFn(url);

      if (res.ok) {
        return;
      }
    } catch {
      // Backend is not listening yet.
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `startStoreNode: backend did not become healthy within ` +
          `${opts.timeoutMs}ms (GET ${url})`,
      );
    }

    await sleep(
      opts.pollIntervalMs,
    );
  }
}

function killChild(
  child: ChildProcess,
): Promise<void> {
  return new Promise((resolve) => {
    if (
      child.exitCode !== null ||
      child.signalCode !== null
    ) {
      resolve();

      return;
    }

    const forceTimer: {
      handle:
        | NodeJS.Timeout
        | undefined;
    } = {
      handle: undefined,
    };

    const onExit = (): void => {
      if (forceTimer.handle) {
        clearTimeout(
          forceTimer.handle,
        );
      }

      resolve();
    };

    child.once(
      "exit",
      onExit,
    );

    child.kill("SIGTERM");

    forceTimer.handle =
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // Process already exited.
        }
      }, DEFAULT_STOP_GRACE_MS);
  });
}

function killChildSync(
  child: ChildProcess,
): void {
  if (
    child.exitCode !== null ||
    child.signalCode !== null
  ) {
    return;
  }

  const pid = child.pid;

  try {
    child.kill("SIGKILL");
  } catch {
    // Process already exited.
  }

  if (pid === undefined) {
    return;
  }

  if (process.platform === "win32") {
    try {
      execFileSync(
        "taskkill",
        [
          "/pid",
          String(pid),
          "/T",
          "/F",
        ],
        {
          stdio: "ignore",
        },
      );
    } catch {
      // Best-effort.
    }

    return;
  }

  try {
    process.kill(
      pid,
      "SIGKILL",
    );
  } catch {
    // Best-effort.
  }
}

export async function startStoreNode(
  opts: StartStoreNodeOptions,
): Promise<StoreNodeHandle> {
  const deviceId =
    opts.deviceId.trim();

  if (!deviceId) {
    throw new Error(
      "startStoreNode: deviceId is required",
    );
  }

  const spawnFn =
    opts.spawnFn ?? nodeSpawn;

  const fetchFn =
    opts.fetchFn ?? fetch;

  const existsFn =
    opts.existsFn ?? existsSync;

  const getFreePortFn =
    opts.getFreePortFn ??
    getFreePort;

  const getSecretsFn =
    opts.getSecretsFn ??
    loadOrCreateStoreNodeSecrets;

  const healthTimeoutMs =
    opts.healthTimeoutMs ??
    DEFAULT_HEALTH_TIMEOUT_MS;

  const healthPollIntervalMs =
    opts.healthPollIntervalMs ??
    DEFAULT_HEALTH_POLL_INTERVAL_MS;

  const onLog =
    opts.onLog ?? (() => {});

  const baseEnv =
    opts.env ?? process.env;

  const backendCwd =
    opts.backendCwd ??
    defaultBackendDir();

  const backendEntry =
    opts.backendEntry ??
    path.join(
      backendCwd,
      "dist",
      "server.js",
    );

  const userDataDir =
    opts.userDataDir ??
    path.join(
      os.tmpdir(),
      "rxpos-store-node",
    );

  const electronPath =
    opts.electronPath ??
    process.execPath;

  if (!existsFn(backendEntry)) {
    throw new Error(
      `startStoreNode: backend entry not found at "${backendEntry}". ` +
        "Build the backend first.",
    );
  }

  const port =
    opts.port ??
    (await getFreePortFn());

  const secrets =
    getSecretsFn(userDataDir);

  const env: NodeJS.ProcessEnv = {
    ...baseEnv,

    ELECTRON_RUN_AS_NODE: "1",

    DATA_BACKEND: "sqlite",

    LOCAL_DB_PATH:
      storeNodeDbPath(
        userDataDir,
      ),

    PORT: String(port),

    NODE_ENV: "production",

    JWT_ACCESS_SECRET:
      secrets.JWT_ACCESS_SECRET,

    JWT_REFRESH_SECRET:
      secrets.JWT_REFRESH_SECRET,

    SYNC_TOKEN_SECRET:
      secrets.SYNC_TOKEN_SECRET,

    LICENSE_TOKEN_SECRET:
      secrets.LICENSE_TOKEN_SECRET,

    PIN_PEPPER_SECRET:
      secrets.PIN_PEPPER_SECRET,

    POS_OVERRIDE_SECRET:
      secrets.POS_OVERRIDE_SECRET,

    LOCAL_DB_MASTER_KEY:
      secrets.LOCAL_DB_MASTER_KEY,

    /**
     * Critical:
     *
     * This exact device ID is also used by main.ts when deriving the SQLCipher
     * key through deriveStoreNodeDbKey().
     */
    SYNC_DEVICE_ID: deviceId,

    SETUP_ACCESS_CODE:
      secrets.SETUP_ACCESS_CODE,
  };

  const nativeOverride =
    opts.electronNativeOverride;

  const useNativeOverride =
    !!nativeOverride &&
    existsFn(
      nativeOverride.hookPath,
    ) &&
    existsFn(
      nativeOverride.sqlcipherEntry,
    );

  if (useNativeOverride) {
    env.RXPOS_NATIVE_SQLCIPHER_ENTRY =
      nativeOverride.sqlcipherEntry;
  }

  const childArgs =
    useNativeOverride
      ? [
          "--require",
          nativeOverride.hookPath,
          backendEntry,
        ]
      : [backendEntry];

  const child = spawnFn(
    electronPath,
    childArgs,
    {
      cwd: backendCwd,
      env,
      stdio: [
        "ignore",
        "pipe",
        "pipe",
      ],
    },
  );

  child.stdout?.on(
    "data",
    (chunk: Buffer) =>
      onLog(
        `[store-node] ${chunk
          .toString()
          .trimEnd()}`,
      ),
  );

  child.stderr?.on(
    "data",
    (chunk: Buffer) =>
      onLog(
        `[store-node:err] ${chunk
          .toString()
          .trimEnd()}`,
      ),
  );

  let exited = false;

  let exitError:
    | Error
    | undefined;

  child.once(
    "exit",
    (code, signal) => {
      exited = true;

      if (
        code !== 0 &&
        code !== null
      ) {
        exitError = new Error(
          `startStoreNode: backend process exited early with code ${code} ` +
            `(signal ${signal ?? "none"})`,
        );
      }
    },
  );

  child.once(
    "error",
    (err) => {
      exited = true;
      exitError = err;
    },
  );

  try {
    await waitForHealth({
      port,
      fetchFn,
      timeoutMs:
        healthTimeoutMs,
      pollIntervalMs:
        healthPollIntervalMs,
      isExited: () => exited,
      getExitError: () =>
        exitError,
    });
  } catch (err) {
    await killChild(child);

    throw err;
  }

  let stopped = false;

  const stop =
    async (): Promise<void> => {
      if (stopped) {
        return;
      }

      stopped = true;

      await killChild(child);
    };

  const killNow = (): void => {
    if (stopped) {
      return;
    }

    stopped = true;

    killChildSync(child);
  };

  return {
    port,
    stop,
    killNow,
  };
}