// SN-4 Task 3: offline first-run onboarding.
//
// KEY DESIGN:
//
// Reuse the backend's existing first-run /setup flow instead of building a
// second setup system.
//
// The backend already owns:
//
//   GET  /api/v1/setup/status
//   POST /api/v1/setup/complete
//
// This module only ensures that the encrypted local SQLite database has its
// schema before the Store Node server starts for the first time.
//
// Device identity is supplied by main.ts.
//
// The exact same deviceId is used for:
//
//   1. SQLCipher key derivation
//   2. Store Node SYNC_DEVICE_ID
//   3. RX POS device identity
//   4. future RXAdmin activation binding
//
// No cloud connection is required by this module.

import {
  type ChildProcess,
  spawn as nodeSpawn,
} from "node:child_process";

import {
  existsSync,
} from "node:fs";

import path from "node:path";

import type {
  StoreNodeSecrets,
} from "./store-node-config";

import {
  deriveStoreNodeLocalDbKey,
} from "./key-derivation";

// -----------------------------------------------------------------------------
// TYPES
// -----------------------------------------------------------------------------

export interface EnsureStoreNodeReadyOptions {
  /**
   * Exact encrypted local database path used by the Store Node.
   */
  dbPath: string;

  /**
   * Derived 32-byte SQLCipher key.
   *
   * Never persist this value.
   */
  key: Buffer;

  /**
   * RX POS backend root directory.
   */
  backendDir: string;

  /**
   * Electron executable.
   *
   * The one-shot schema process runs Electron with
   * ELECTRON_RUN_AS_NODE=1.
   */
  electronPath?: string;

  /**
   * Loose runtime one-shot schema script.
   */
  oneShotScriptPath?: string;

  /**
   * Electron ABI-compatible SQLCipher native module override.
   */
  electronNativeOverride?: {
    hookPath: string;

    sqlcipherEntry: string;
  };

  /**
   * Store Node installation-local secrets.
   *
   * The backend config module is loaded transitively by the schema-push code,
   * so the backend-required secrets must be available in the child environment.
   */
  secrets?: StoreNodeSecrets;

  spawnFn?: typeof nodeSpawn;

  existsFn?: (
    path: string,
  ) => boolean;

  env?: NodeJS.ProcessEnv;

  onLog?: (
    line: string,
  ) => void;
}

export interface EnsureStoreNodeReadyResult {
  firstRun: boolean;
}

export interface DeriveStoreNodeDbKeyOptions {
  /**
   * Kept for compatibility with the existing main.ts call.
   *
   * Key derivation no longer dynamically requires a generated backend dist
   * artifact.
   */
  backendDir?: string;

  masterKey: string;

  deviceId: string;
}

// -----------------------------------------------------------------------------
// PATHS
// -----------------------------------------------------------------------------

function defaultOneShotScriptPath(): string {
  return path.resolve(
    __dirname,
    "..",
    "..",
    "scripts",
    "push-sqlite-schema-oneshot.cjs",
  );
}

// -----------------------------------------------------------------------------
// ONE-SHOT SCHEMA PUSH
// -----------------------------------------------------------------------------

function runOneShotPush(opts: {
  spawnFn: typeof nodeSpawn;

  electronPath: string;

  scriptPath: string;

  backendDir: string;

  dbPath: string;

  key: Buffer;

  env: NodeJS.ProcessEnv;

  secrets?: StoreNodeSecrets;

  electronNativeOverride?: {
    hookPath: string;

    sqlcipherEntry: string;
  };

  existsFn: (
    path: string,
  ) => boolean;

  onLog: (
    line: string,
  ) => void;
}): Promise<void> {
  return new Promise(
    (
      resolvePromise,
      rejectPromise,
    ) => {
      const env: NodeJS.ProcessEnv = {
        ...opts.env,

        DATA_BACKEND: "sqlite",

        ...(opts.secrets
          ? {
              JWT_ACCESS_SECRET:
                opts.secrets
                  .JWT_ACCESS_SECRET,

              JWT_REFRESH_SECRET:
                opts.secrets
                  .JWT_REFRESH_SECRET,

              SYNC_TOKEN_SECRET:
                opts.secrets
                  .SYNC_TOKEN_SECRET,

              LICENSE_TOKEN_SECRET:
                opts.secrets
                  .LICENSE_TOKEN_SECRET,

              PIN_PEPPER_SECRET:
                opts.secrets
                  .PIN_PEPPER_SECRET,

              POS_OVERRIDE_SECRET:
                opts.secrets
                  .POS_OVERRIDE_SECRET,

              LOCAL_DB_MASTER_KEY:
                opts.secrets
                  .LOCAL_DB_MASTER_KEY,

              SETUP_ACCESS_CODE:
                opts.secrets
                  .SETUP_ACCESS_CODE,
            }
          : {}),

        ELECTRON_RUN_AS_NODE: "1",

        RXPOS_PUSH_BACKEND_DIR:
          opts.backendDir,

        RXPOS_PUSH_DB_PATH:
          opts.dbPath,

        RXPOS_PUSH_DB_KEY_HEX:
          opts.key.toString("hex"),
      };

      const nativeOverride =
        opts.electronNativeOverride;

      const useNativeOverride =
        Boolean(
          nativeOverride &&
            opts.existsFn(
              nativeOverride.hookPath,
            ) &&
            opts.existsFn(
              nativeOverride.sqlcipherEntry,
            ),
        );

      if (
        useNativeOverride &&
        nativeOverride
      ) {
        env.RXPOS_NATIVE_SQLCIPHER_ENTRY =
          nativeOverride.sqlcipherEntry;
      }

      const args =
        useNativeOverride &&
        nativeOverride
          ? [
              "--require",
              nativeOverride.hookPath,
              opts.scriptPath,
            ]
          : [
              opts.scriptPath,
            ];

      let child: ChildProcess;

      try {
        child =
          opts.spawnFn(
            opts.electronPath,
            args,
            {
              cwd:
                opts.backendDir,

              env,

              stdio: [
                "ignore",
                "pipe",
                "pipe",
              ],
            },
          );
      } catch (error) {
        rejectPromise(
          error instanceof Error
            ? error
            : new Error(
                String(error),
              ),
        );

        return;
      }

      child.stdout?.on(
        "data",
        (
          chunk: Buffer,
        ) => {
          opts.onLog(
            `[schema-push] ${chunk
              .toString()
              .trimEnd()}`,
          );
        },
      );

      child.stderr?.on(
        "data",
        (
          chunk: Buffer,
        ) => {
          opts.onLog(
            `[schema-push:err] ${chunk
              .toString()
              .trimEnd()}`,
          );
        },
      );

      child.once(
        "error",
        (
          error,
        ) => {
          rejectPromise(
            error,
          );
        },
      );

      child.once(
        "exit",
        (
          code,
          signal,
        ) => {
          if (code === 0) {
            resolvePromise();

            return;
          }

          rejectPromise(
            new Error(
              "ensureStoreNodeReady: schema push exited " +
                `with code ${code} ` +
                `(signal ${signal ?? "none"})`,
            ),
          );
        },
      );
    },
  );
}

// -----------------------------------------------------------------------------
// STORE NODE READINESS
// -----------------------------------------------------------------------------

/**
 * Ensures the encrypted Store Node database is initialized.
 *
 * Existing DB:
 *
 *   no-op
 *
 * Fresh installation:
 *
 *   run one-shot encrypted SQLite schema push
 *
 * This function does not perform:
 *
 *   cloud login
 *   device approval
 *   cloud token refresh
 *   POS authentication
 *
 * Therefore the existing offline POS behavior remains separate.
 */
export async function ensureStoreNodeReady(
  opts: EnsureStoreNodeReadyOptions,
): Promise<EnsureStoreNodeReadyResult> {
  const existsFn =
    opts.existsFn ??
    existsSync;

  const spawnFn =
    opts.spawnFn ??
    nodeSpawn;

  const electronPath =
    opts.electronPath ??
    process.execPath;

  const scriptPath =
    opts.oneShotScriptPath ??
    defaultOneShotScriptPath();

  const onLog =
    opts.onLog ??
    ((): void => {});

  const env =
    opts.env ??
    process.env;

  if (
    existsFn(
      opts.dbPath,
    )
  ) {
    return {
      firstRun: false,
    };
  }

  await runOneShotPush({
    spawnFn,

    electronPath,

    scriptPath,

    backendDir:
      opts.backendDir,

    dbPath:
      opts.dbPath,

    key:
      opts.key,

    env,

    secrets:
      opts.secrets,

    electronNativeOverride:
      opts.electronNativeOverride,

    existsFn,

    onLog,
  });

  return {
    firstRun: true,
  };
}

// -----------------------------------------------------------------------------
// SQLCIPHER KEY DERIVATION
// -----------------------------------------------------------------------------

/**
 * Derives the Store Node SQLCipher key.
 *
 * The derived key is intentionally never persisted.
 *
 * Inputs:
 *
 *   installation-local LOCAL_DB_MASTER_KEY
 *   real RX POS device fingerprint
 *
 * Output:
 *
 *   32-byte SQLCipher key
 */
export function deriveStoreNodeDbKey(
  opts: DeriveStoreNodeDbKeyOptions,
): Buffer {
  return deriveStoreNodeLocalDbKey(
    opts.masterKey,
    opts.deviceId,
  );
}