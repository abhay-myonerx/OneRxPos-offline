import path from "node:path";
import { appendFileSync, writeFileSync, mkdirSync } from "node:fs";
import { app, BrowserWindow, dialog, protocol } from "electron";
import { privilegedSchemes, registerAppProtocol } from "./config/app-protocol";
import { buildWindowOptions } from "./config/window-options";
import { resolveEntry, bundleDir } from "./config/urls";
import { applyHardening } from "./security/harden";
import { resolveKiosk } from "./security/kiosk";
import { recordCrashAndShouldRelaunch } from "./security/crash-history";
import { keyFromEnv } from "./security/renderer-crypto";
import {
  verifyBundleIntegrity,
  bundleIsEncrypted,
} from "./security/verify-bundle";
import { getDeviceFingerprint } from "./security/device-fingerprint";
import {
  startStoreNode,
  storeNodeDbPath,
  type StoreNodeHandle,
} from "./store-node/launcher";
import {
  deriveStoreNodeDbKey,
  ensureStoreNodeReady,
} from "./store-node/onboarding";
import { resolveStoreNodeResourcePaths } from "./store-node/resource-paths";
import { loadOrCreateStoreNodeSecrets } from "./store-node/store-node-config";
import {
  ensureStoreNodeRuntimeDirectories,
  resolveStoreNodeRuntimePaths,
} from "./store-node/runtime-paths";
import { migrateLegacyStoreNodeDatabase } from "./store-node/runtime-migration";

// Must run before app is ready.
protocol.registerSchemesAsPrivileged(privilegedSchemes());

const { kiosk: isKiosk } = resolveKiosk(process.env);
process.env.RXPOS_APP_VERSION = app.getVersion();

// Set once startStoreNode() resolves (see app.whenReady() below). Held at
// module scope so the shutdown hooks (before-quit, the crash-loop guard) can
// gracefully stop the spawned backend child instead of leaking it.
let stopStoreNode: (() => Promise<void>) | undefined;
// Synchronous counterpart to stopStoreNode, for onCrash below — see
// StoreNodeHandle.killNow's doc comment in store-node/launcher.ts for why
// app.exit() needs this instead of the async stop().
let killStoreNodeNow: (() => void) | undefined;

function createWindow(apiOrigin: string): BrowserWindow {
  const preloadPath = path.join(__dirname, "preload.cjs");
  const win = new BrowserWindow(
    buildWindowOptions({ preloadPath, kiosk: isKiosk }),
  );
  win.once("ready-to-show", () => win.show());

  applyHardening(win, {
    dev: !app.isPackaged,
    apiOrigin,
  });

  const entry = resolveEntry({
    isPackaged: app.isPackaged,
    devServerUrl: process.env.RXPOS_DEV_SERVER ?? "http://localhost:3000",
  });

  console.log("==================================");
  console.log("Electron Entry:", entry);
  console.log("Electron URL :", entry.url);
  console.log("==================================");
  win.loadURL(entry.url);
  return win;
}

// The store-node child's stdout/stderr carries the ONLY real reason it failed
// to boot (config-validation stack trace, native-module load error, etc.). In
// a packaged windowed .exe there is no attached console, so routing that output
// to console.log() (as this used to) silently discards it — leaving the startup
// dialog able to report only the bare exit code. We instead persist every line
// to a log file under userData AND keep the last N lines in memory so the
// failure dialog can quote them back to whoever is running the exe.
const storeNodeLogTail: string[] = [];
const STORE_NODE_LOG_TAIL_MAX = 200;

function makeStoreNodeLogger(logsDir: string): {
  log: (line: string) => void;
  logPath: string;
} {
  mkdirSync(logsDir, {
    recursive: true,
  });

  const logPath = path.join(logsDir, "store-node-boot.log");

  storeNodeLogTail.length = 0;

  try {
    writeFileSync(
      logPath,
      `=== store-node boot log — ${new Date().toISOString()} ===\n`,
      {
        encoding: "utf8",
      },
    );
  } catch {
    // Logging must never block application startup.
  }

  const log = (line: string): void => {
    storeNodeLogTail.push(line);

    if (storeNodeLogTail.length > STORE_NODE_LOG_TAIL_MAX) {
      storeNodeLogTail.shift();
    }

    console.log(line);

    try {
      appendFileSync(logPath, `${line}\n`, {
        encoding: "utf8",
      });
    } catch {
      // Logging failure must never abort backend startup.
    }
  };

  return {
    log,
    logPath,
  };
}

// Never leave the user staring at a blank window: if the store-node backend
// fails to boot/health-gate, surface a real error dialog instead.
function showStoreNodeStartupError(err: unknown, logPath?: string): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error("Failed to start the store-node backend:", err);
  const tail = storeNodeLogTail.slice(-25).join("\n");
  dialog.showErrorBox(
    "RX POS could not start",
    "The local store-node backend failed to start, so RX POS cannot open.\n\n" +
      message +
      (tail ? `\n\n--- backend output (last lines) ---\n${tail}` : "") +
      (logPath ? `\n\nFull log saved to:\n${logPath}` : "") +
      "\n\nIf this keeps happening, check that the backend was built " +
      "(cd rx-pos-backend && npm run build) and its native module targets " +
      "Electron (npm run rebuild:native:backend from rx-pos-desktop).",
  );
}

// Launch-on-boot (Windows), behind an explicit flag — off by default.
if (process.env.RXPOS_LAUNCH_ON_BOOT === "1") {
  app.setLoginItemSettings({ openAtLogin: true });
}

// Crash-loop guard: relaunch the app unless too many crashes happened recently.
// Crash timestamps persist to a userData file because app.relaunch() spawns a brand
// new process — an in-memory array would reset to [] every time, so the throttle
// would never fire.
const crashHistoryFile = path.join(
  app.getPath("userData"),
  "crash-history.json",
);
const onCrash = () => {
  // Data-safety fix (SN-4 final review): app.exit() below does NOT fire
  // "before-quit", so the async stopStoreNode() (SIGTERM -> grace ->
  // SIGKILL) would never get to finish — a fire-and-forget `void
  // stopStoreNode?.()` here left the spawned store-node child able to
  // survive as an orphan, still holding the encrypted store-node.db
  // (SQLCipher WAL) open. On relaunch, ensureStoreNodeReady no-ops (the
  // file already exists) and a SECOND server would open the SAME encrypted
  // DB file -> "database is locked" / corruption risk. killNow() kills the
  // child SYNCHRONOUSLY, so it is provably dead before app.exit() runs.
  killStoreNodeNow?.();
  const relaunch = recordCrashAndShouldRelaunch(crashHistoryFile, Date.now(), {
    maxRestarts: 3,
    windowMs: 60_000,
  });
  if (relaunch) app.relaunch();
  app.exit(0);
};
app.on("render-process-gone", onCrash);
app.on("child-process-gone", onCrash);

app.whenReady().then(async () => {
  // Spawn + health-gate the store-node backend BEFORE creating any window —
  // the renderer has nothing to talk to until this resolves. On failure,
  // surface a real error dialog rather than an empty/blank window.
  //
  // SN-5 Task 3: dev runs against the sibling rx-pos-backend checkout;
  // packaged runs against the extraResources bundle under
  // process.resourcesPath (electron-builder.yml + scripts/prepare-backend-
  // resources.mjs) — see resolveStoreNodeResourcePaths's doc comment for why
  // app.getAppPath() (inside app.asar once packaged) isn't usable here.
  const resourcePaths = resolveStoreNodeResourcePaths({
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
  });
  const backendDir = resourcePaths.backendDir;

  const userDataDir = app.getPath("userData");

  const runtimePaths = resolveStoreNodeRuntimePaths(userDataDir);

  ensureStoreNodeRuntimeDirectories(runtimePaths);

  migrateLegacyStoreNodeDatabase(userDataDir, runtimePaths);

  const { log: logStoreNode, logPath: storeNodeLogPath } = makeStoreNodeLogger(
    runtimePaths.logsDir,
  );
  // WATCH-SN4-1 (see scripts/rebuild-native-backend.mjs): a private,
  // Electron-targeted copy of better-sqlite3-multiple-ciphers, redirected to
  // via a --require hook — see StartStoreNodeOptions.electronNativeOverride.
  // Shared by both the schema-push one-shot below AND the server spawn
  // further down: both children transitively require this native module.
  const electronNativeOverride = {
    hookPath: resourcePaths.hookPath,
    sqlcipherEntry: resourcePaths.sqlcipherEntry,
  };

  // SN-5 OPS-1: hoisted so it's readable after the try block below, once
  // secrets are loaded — threaded to the renderer the same way apiOrigin is
  // (an env var set on the main process before createWindow(), inherited by
  // the spawned renderer's process.env; see preload.ts).
  let setupAccessCode: string | undefined;

  let storeNode: StoreNodeHandle;
  try {
    // SN-4 Task 3: offline first-run onboarding. Must run BEFORE
    // startStoreNode() — the schema has to exist in the encrypted DB before
    // the server ever tries to open it. No-ops on every later launch (the DB
    // file already exists by then).
    const secrets = loadOrCreateStoreNodeSecrets(userDataDir);
    setupAccessCode = secrets.SETUP_ACCESS_CODE;
    const dbPath = runtimePaths.dbPath;
    const key = deriveStoreNodeDbKey({
      backendDir,
      masterKey: secrets.LOCAL_DB_MASTER_KEY,
    });
    const { firstRun } = await ensureStoreNodeReady({
      dbPath,
      key,
      backendDir,
      oneShotScriptPath: resourcePaths.oneShotScriptPath,
      electronNativeOverride,
      // SN-5 Task 3 fix: the one-shot schema-push child needs these to
      // satisfy the backend's config schema validation at require() time —
      // see EnsureStoreNodeReadyOptions.secrets's doc comment in onboarding.ts.
      secrets,
      onLog: logStoreNode,
    });
    if (firstRun) {
      console.log(
        "Store-node: first run — schema pushed to a fresh encrypted local DB.",
      );
    }

    storeNode = await startStoreNode({
      // SN-5 bundle+harden pass: packaged runs the bundled/minified/
      // obfuscated server.bundle.cjs; dev runs the plain dist/server.js tsc
      // output — see resolveStoreNodeResourcePaths's serverEntry doc comment.
      backendEntry: resourcePaths.serverEntry,
      backendCwd: backendDir,
      userDataDir,
      electronNativeOverride,
      onLog: logStoreNode,
    });
  } catch (err) {
    showStoreNodeStartupError(err, storeNodeLogPath);
    app.quit();
    return;
  }
  stopStoreNode = storeNode.stop;
  killStoreNodeNow = storeNode.killNow;

  const apiOrigin = `http://127.0.0.1:${storeNode.port}`;
  // preload.ts reads RXPOS_API_ORIGIN directly off process.env at load time
  // (it can't receive constructor args) — Electron spawns each renderer
  // process inheriting the main process's env at that moment, so setting it
  // here before createWindow() is what actually wires the renderer to the
  // just-spawned backend.
  process.env.RXPOS_API_ORIGIN = apiOrigin;
  // SN-5 OPS-1: same mechanism, so preload.ts can expose the store-node's
  // generated setup-access-code to the renderer — see StoreNodeSecrets.
  // SETUP_ACCESS_CODE's doc comment in store-node-config.ts and
  // RxposBridge.setup's doc comment in bridge/contract.ts. Never logged.
  if (setupAccessCode) {
    process.env.RXPOS_SETUP_ACCESS_CODE = setupAccessCode;
  }
  // Compute this lane's device fingerprint HERE (main has full Node: node:crypto
  // + node:os). The sandboxed preload can't, so it reads this value off the env
  // it inherits at createWindow() and surfaces it via window.rxpos.device. Never
  // fatal: on any error the bridge falls back to its stub fingerprint.
  try {
    process.env.RXPOS_DEVICE_FINGERPRINT = await getDeviceFingerprint();
  } catch {
    /* leave unset -> bridge uses its stub constant */
  }

  const dir = bundleDir(process.resourcesPath);
  if (app.isPackaged) {
    const integrity = verifyBundleIntegrity(dir);
    if (!integrity.ok) {
      // Fail closed: a tampered/replaced renderer bundle must not run.
      console.error(
        `Integrity check failed: ${integrity.mismatch ?? "unknown"}`,
      );
      app.quit();
      return;
    }
    const decryptKey = process.env.RENDERER_ENCRYPTION_KEY
      ? keyFromEnv(process.env.RENDERER_ENCRYPTION_KEY)
      : undefined;
    // Fail closed: a hardened build (integrity.json present => renderer was
    // AES-encrypted at package time) must not be served without a decrypt
    // key. Without this guard, verifyBundleIntegrity above still passes
    // (it hashes the on-disk ciphertext) and the app would silently serve
    // encrypted bytes as if plaintext — a white-screen instead of a clear
    // failure.
    if (bundleIsEncrypted(dir) && !decryptKey) {
      console.error(
        "Renderer is encrypted but RENDERER_ENCRYPTION_KEY is not set — refusing to serve undecryptable bundle",
      );
      app.quit();
      return;
    }
    registerAppProtocol(dir, { decryptKey });
  }
  createWindow(apiOrigin);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(apiOrigin);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Graceful shutdown of the spawned store-node child. `app.quit()` (called
// above, or via Cmd+Q / taskbar close / OS shutdown) always fires
// "before-quit" first — intercept it once, SIGTERM the child and await its
// exit, then let the quit proceed. `storeNodeStopping` guards against
// re-entering (the second app.quit() call below re-fires this same handler).
let storeNodeStopping = false;
app.on("before-quit", (event) => {
  if (!stopStoreNode || storeNodeStopping) return;
  storeNodeStopping = true;
  event.preventDefault();
  stopStoreNode()
    .catch((err) => console.error("Error stopping store-node backend:", err))
    .finally(() => app.quit());
});
