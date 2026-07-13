// SN-4 Task 3: offline first-run onboarding.
//
// KEY DESIGN — reuse the backend's EXISTING first-run /setup flow rather than
// building a new onboarding UI or a hardcoded seed. The backend already has
// GET /api/v1/setup/status (needs-setup when tenant.count()===0) and
// POST /api/v1/setup/complete (bootstraps the FIRST tenant + admin from
// empty; refuses if a tenant already exists), and the frontend already has a
// Setup wizard that consumes both. So this module's ONLY job is to make sure
// the encrypted local DB has its SCHEMA pushed (empty — NO seeded
// tenant/admin) before the store-node server boots for the first time. Once
// the schema exists, /setup/status naturally reports "needs setup", and the
// existing wizard collects the real admin/tenant entirely offline through the
// normal backend endpoints — no separate onboarding surface to build/test.
//
// The push runs as a ONE-SHOT child process under Electron-as-node (mirrors
// launcher.ts's own spawn: same `--require` native-hook convention, since the
// pushed-to code transitively requires "better-sqlite3-multiple-ciphers",
// whose backend-owned copy is built for plain Node, not the Electron ABI this
// child runs under). ensureStoreNodeReady is idempotent + safe to call on
// every boot: if the DB file already exists, it's a no-op.
import { type ChildProcess, spawn as nodeSpawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { STORE_NODE_DEVICE_ID, type StoreNodeSecrets } from "./store-node-config";

export interface EnsureStoreNodeReadyOptions {
  /** Path to the encrypted local DB file — the SAME path the server opens (see launcher.ts's storeNodeDbPath()). */
  dbPath: string;
  /** The derived SQLCipher key (deriveStoreNodeDbKey below) — must match what the server derives at boot, or the DB the schema was pushed into won't open later. */
  key: Buffer;
  /** rx-pos-backend repo root — its dist/local/sqlite-push.js is required by the one-shot child. */
  backendDir: string;
  /** Electron binary to spawn-as-node. Defaults to process.execPath (same convention as launcher.ts). */
  electronPath?: string;
  /** Path to scripts/push-sqlite-schema-oneshot.cjs. Defaults to a path relative to this module — dev convenience only; main.ts always passes an explicit path derived from app.getAppPath(). */
  oneShotScriptPath?: string;
  /**
   * Same WATCH-SN4-1 fix launcher.ts uses (see its StartStoreNodeOptions
   * doc): required so the one-shot child's require("better-sqlite3-multiple-
   * ciphers") resolves to the Electron ABI-146 copy instead of the backend's
   * own plain-Node build. Skipped entirely when either path is missing.
   */
  electronNativeOverride?: { hookPath: string; sqlcipherEntry: string };
  /**
   * SN-5 Task 3 fix (packaging-boot risk retirement): the store-node's own
   * persisted secrets (main.ts already loads these via
   * loadOrCreateStoreNodeSecrets before calling this function). When
   * supplied, merged into the one-shot child's env alongside the
   * RXPOS_PUSH_* vars below.
   *
   * Required because `dist/local/sqlite-push.js`'s `generateSyncTriggerDdl`
   * transitively requires `dist/local/sync-triggers.js`, which itself
   * requires `dist/config/database.js` — and THAT module runs
   * `envSchema.parse(process.env)` at load time, unconditionally, even
   * though the one-shot push never actually touches the JWT/sync/license/PIN
   * secrets it validates. In dev this was silently satisfied because the
   * child's cwd is the real backend checkout, which has its own `.env` file
   * (loaded by the backend's `dotenv.config()`) with dev placeholder
   * secrets. A packaged build ships no `.env` (see
   * scripts/prepare-backend-resources.mjs), so without this, the schema
   * push — and therefore first-run onboarding — fails outside dev with a
   * ZodError on missing JWT_ACCESS_SECRET etc. Optional so existing tests
   * that construct `env` directly keep working unchanged.
   */
  secrets?: StoreNodeSecrets;
  spawnFn?: typeof nodeSpawn;
  existsFn?: (p: string) => boolean;
  env?: NodeJS.ProcessEnv;
  onLog?: (line: string) => void;
}

export interface EnsureStoreNodeReadyResult {
  firstRun: boolean;
}

function defaultOneShotScriptPath(): string {
  // Dev convenience only (mirrors launcher.ts's defaultBackendDir()): main.ts
  // always passes an explicit oneShotScriptPath derived from
  // app.getAppPath(), which stays correct once SN-5 repoints it at a
  // packaged resource.
  return path.resolve(__dirname, "..", "..", "scripts", "push-sqlite-schema-oneshot.cjs");
}

function runOneShotPush(opts: {
  spawnFn: typeof nodeSpawn;
  electronPath: string;
  scriptPath: string;
  backendDir: string;
  dbPath: string;
  key: Buffer;
  env: NodeJS.ProcessEnv;
  secrets?: StoreNodeSecrets;
  electronNativeOverride?: { hookPath: string; sqlcipherEntry: string };
  existsFn: (p: string) => boolean;
  onLog: (line: string) => void;
}): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const env: NodeJS.ProcessEnv = {
      ...opts.env,
      // SN-5 Task 3 fix: `sync-triggers.js` (required by sqlite-push.js for
      // generateSyncTriggerDdl) transitively requires `config/database.js`,
      // which EAGERLY constructs a top-level `prisma` singleton at require()
      // time — `createPostgresPrismaClient()` when DATA_BACKEND isn't
      // "sqlite" (the config schema default), which throws on the missing
      // `DATABASE_URL` this store-node never sets. In dev this was masked by
      // rx-pos-backend's own `.env` happening to define a DATABASE_URL
      // placeholder; a packaged build ships no `.env`. This one-shot only
      // ever operates on the local sqlite file, so DATA_BACKEND: "sqlite" is
      // simply correct here — it routes the (otherwise-unused) eager
      // singleton to `createSqlitePrismaClient()` instead, which only needs
      // LOCAL_DB_MASTER_KEY (supplied via `secrets` below) and never
      // actually opens a connection at construction time (Prisma clients
      // connect lazily), so this has no effect beyond satisfying the
      // module-load-time side effect.
      DATA_BACKEND: "sqlite",
      // See EnsureStoreNodeReadyOptions.secrets's doc comment: the pushed-to
      // module chain loads rx-pos-backend's config schema at require() time,
      // which needs these present regardless of whether the push itself
      // uses them.
      ...(opts.secrets
        ? {
            JWT_ACCESS_SECRET: opts.secrets.JWT_ACCESS_SECRET,
            JWT_REFRESH_SECRET: opts.secrets.JWT_REFRESH_SECRET,
            SYNC_TOKEN_SECRET: opts.secrets.SYNC_TOKEN_SECRET,
            LICENSE_TOKEN_SECRET: opts.secrets.LICENSE_TOKEN_SECRET,
            PIN_PEPPER_SECRET: opts.secrets.PIN_PEPPER_SECRET,
            POS_OVERRIDE_SECRET: opts.secrets.POS_OVERRIDE_SECRET,
            LOCAL_DB_MASTER_KEY: opts.secrets.LOCAL_DB_MASTER_KEY,
          }
        : {}),
      ELECTRON_RUN_AS_NODE: "1",
      RXPOS_PUSH_BACKEND_DIR: opts.backendDir,
      RXPOS_PUSH_DB_PATH: opts.dbPath,
      RXPOS_PUSH_DB_KEY_HEX: opts.key.toString("hex"),
    };

    const nativeOverride = opts.electronNativeOverride;
    const useNativeOverride =
      !!nativeOverride &&
      opts.existsFn(nativeOverride.hookPath) &&
      opts.existsFn(nativeOverride.sqlcipherEntry);
    if (useNativeOverride) {
      env.RXPOS_NATIVE_SQLCIPHER_ENTRY = nativeOverride!.sqlcipherEntry;
    }
    const args = useNativeOverride
      ? ["--require", nativeOverride!.hookPath, opts.scriptPath]
      : [opts.scriptPath];

    let child: ChildProcess;
    try {
      child = opts.spawnFn(opts.electronPath, args, {
        cwd: opts.backendDir,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      rejectPromise(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    child.stdout?.on("data", (chunk: Buffer) =>
      opts.onLog(`[schema-push] ${chunk.toString().trimEnd()}`),
    );
    child.stderr?.on("data", (chunk: Buffer) =>
      opts.onLog(`[schema-push:err] ${chunk.toString().trimEnd()}`),
    );

    child.once("error", (err) => rejectPromise(err));
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(
          new Error(
            `ensureStoreNodeReady: schema push exited with code ${code} (signal ${
              signal ?? "none"
            })`,
          ),
        );
      }
    });
  });
}

/**
 * Ensures the encrypted local DB is ready for the store-node server to open.
 *
 * First run (no file at `dbPath`): pushes the schema (empty — no seed) via a
 * one-shot child, awaits its exit-0, then returns `{ firstRun: true }`. The
 * server then boots against an empty-but-schema'd DB, and
 * /api/v1/setup/status naturally reports "needs setup" — the existing Setup
 * wizard takes it from there, fully offline.
 *
 * Every later run (file already exists): no-op, returns `{ firstRun: false }`.
 * Idempotent + safe to call on every boot.
 */
export async function ensureStoreNodeReady(
  opts: EnsureStoreNodeReadyOptions,
): Promise<EnsureStoreNodeReadyResult> {
  const existsFn = opts.existsFn ?? existsSync;
  const spawnFn = opts.spawnFn ?? nodeSpawn;
  const electronPath = opts.electronPath ?? process.execPath;
  const scriptPath = opts.oneShotScriptPath ?? defaultOneShotScriptPath();
  const onLog = opts.onLog ?? ((): void => {});
  const env = opts.env ?? process.env;

  if (existsFn(opts.dbPath)) {
    return { firstRun: false };
  }

  await runOneShotPush({
    spawnFn,
    electronPath,
    scriptPath,
    backendDir: opts.backendDir,
    dbPath: opts.dbPath,
    key: opts.key,
    env,
    secrets: opts.secrets,
    electronNativeOverride: opts.electronNativeOverride,
    existsFn,
    onLog,
  });

  return { firstRun: true };
}

// Cross-repo dynamic require (deliberately NOT a static import): rx-pos-backend
// is a sibling repo, not an npm dependency of rx-pos-desktop, and its build
// output only exists once `cd rx-pos-backend && npm run build` has run. This
// runs in the Electron MAIN process (not a spawned electron-as-node child —
// key-derivation.js has no native deps, just node:crypto, so requiring it
// directly here is safe), and importing the backend's OWN
// deriveLocalDbKey/key-derivation.js (rather than re-implementing PBKDF2
// params in this repo) is what guarantees onboarding derives the EXACT SAME
// key the server derives at boot (src/config/database.ts's getLocalDb() /
// createSqlitePrismaClient()) — a hand-copied algorithm could silently drift
// and produce a DB the server can never open.
function requireBackendDeriveLocalDbKey(
  backendDir: string,
): (masterKey: string, deviceId: string) => Buffer {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require(path.join(backendDir, "dist", "local", "key-derivation.js")) as {
    deriveLocalDbKey: (masterKey: string, deviceId: string) => Buffer;
  };
  return mod.deriveLocalDbKey;
}

/**
 * Derives the SQLCipher key for the local DB — the exact same derivation
 * (algorithm + params, imported live from the backend's own build output)
 * and the exact same deviceId (STORE_NODE_DEVICE_ID, also passed to the
 * spawned server as SYNC_DEVICE_ID by launcher.ts) that
 * src/config/database.ts uses when the server itself opens the DB. Onboarding
 * MUST use this — not a hand-rolled derivation — or the schema-pushed file
 * and the server's own open() would disagree on the key.
 */
export function deriveStoreNodeDbKey(opts: {
  backendDir: string;
  masterKey: string;
  deviceId?: string;
}): Buffer {
  const deriveLocalDbKey = requireBackendDeriveLocalDbKey(opts.backendDir);
  return deriveLocalDbKey(opts.masterKey, opts.deviceId ?? STORE_NODE_DEVICE_ID);
}
