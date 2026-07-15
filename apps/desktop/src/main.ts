import path from "node:path";
import { appendFileSync, writeFileSync } from "node:fs";
import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  protocol,
} from "electron";
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
import { performCloudRequest } from "./cloud-auth/cloud-request";
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

// Must run before Electron app ready.
protocol.registerSchemesAsPrivileged(privilegedSchemes());

const { kiosk: isKiosk } = resolveKiosk(process.env);

process.env.RXPOS_APP_VERSION = app.getVersion();

/**
 * TEMPORARY:
 *
 * Enable DevTools in packaged EXE while testing
 * RXAdmin / RX Connect cloud authentication.
 *
 * MUST be false before production release.
 */
const enableTestDevTools = true;

let stopStoreNode: (() => Promise<void>) | undefined;

let killStoreNodeNow: (() => void) | undefined;

function registerCloudAuthIpc(): void {
  ipcMain.removeHandler("cloud-auth:request");

  ipcMain.handle("cloud-auth:request", async (_event, payload) => {
    return performCloudRequest(payload);
  });
}

function createWindow(apiOrigin: string): BrowserWindow {
  const preloadPath = path.join(__dirname, "preload.cjs");

  const windowOptions = buildWindowOptions({
    preloadPath,
    kiosk: isKiosk,
  });

  /**
   * TEMPORARY:
   *
   * Allow DevTools in packaged EXE while
   * testing RXAdmin cloud authentication.
   */
  if (enableTestDevTools) {
    windowOptions.webPreferences = {
      ...windowOptions.webPreferences,

      devTools: true,
    };
  }

  const win = new BrowserWindow(windowOptions);

  win.once("ready-to-show", () => win.show());

  /**
   * Keep existing Electron hardening.
   *
   * We do NOT remove security hardening.
   */
  applyHardening(win, {
    dev: !app.isPackaged || enableTestDevTools,

    apiOrigin,
  });

  const entry = resolveEntry({
    isPackaged: app.isPackaged,

    devServerUrl: process.env.RXPOS_DEV_SERVER ?? "http://localhost:3000",
  });

  console.log("==================================");

  console.log("Electron Entry:", entry);

  console.log("Electron URL :", entry.url);

  console.log("Test DevTools:", enableTestDevTools);

  console.log("==================================");

  win.loadURL(entry.url);

  return win;
}

const storeNodeLogTail: string[] = [];

const STORE_NODE_LOG_TAIL_MAX = 200;

function makeStoreNodeLogger(userDataDir: string): {
  log: (line: string) => void;
  logPath: string;
} {
  const logPath = path.join(userDataDir, "store-node-boot.log");

  try {
    writeFileSync(
      logPath,
      `=== store-node boot log — ${new Date().toISOString()} ===\n`,
    );
  } catch {
    // Logging must never block startup.
  }

  const log = (line: string): void => {
    storeNodeLogTail.push(line);

    if (storeNodeLogTail.length > STORE_NODE_LOG_TAIL_MAX) {
      storeNodeLogTail.shift();
    }

    console.log(line);

    try {
      appendFileSync(logPath, line + "\n");
    } catch {
      // Best-effort logging.
    }
  };

  return {
    log,
    logPath,
  };
}

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
      "(cd backend && npm run build) and its native module targets " +
      "Electron (npm run rebuild:native:backend from desktop).",
  );
}

if (process.env.RXPOS_LAUNCH_ON_BOOT === "1") {
  app.setLoginItemSettings({
    openAtLogin: true,
  });
}

const crashHistoryFile = path.join(
  app.getPath("userData"),
  "crash-history.json",
);

const onCrash = (): void => {
  killStoreNodeNow?.();

  const relaunch = recordCrashAndShouldRelaunch(crashHistoryFile, Date.now(), {
    maxRestarts: 3,
    windowMs: 60_000,
  });

  if (relaunch) {
    app.relaunch();
  }

  app.exit(0);
};

app.on("render-process-gone", onCrash);

app.on("child-process-gone", onCrash);

app.whenReady().then(async () => {
  const resourcePaths = resolveStoreNodeResourcePaths({
    isPackaged: app.isPackaged,

    appPath: app.getAppPath(),

    resourcesPath: process.resourcesPath,
  });
  registerCloudAuthIpc();

  const backendDir = resourcePaths.backendDir;

  const userDataDir = app.getPath("userData");

  const { log: logStoreNode, logPath: storeNodeLogPath } =
    makeStoreNodeLogger(userDataDir);

  const electronNativeOverride = {
    hookPath: resourcePaths.hookPath,

    sqlcipherEntry: resourcePaths.sqlcipherEntry,
  };

  let setupAccessCode: string | undefined;

  let deviceId: string;

  let storeNode: StoreNodeHandle;

  try {
    /**
     * Device identity is resolved ONCE for this boot.
     *
     * The same exact value is used for:
     *
     *   SQLCipher key derivation
     *   SYNC_DEVICE_ID
     *   renderer device bridge
     *   future RXAdmin device activation
     *
     * Do not fall back to a shared/static device ID here.
     */
    deviceId = (await getDeviceFingerprint()).trim();

    if (!deviceId) {
      throw new Error("RX POS device fingerprint is unavailable.");
    }

    /**
     * Expose the same fingerprint to preload before the renderer is created.
     *
     * No fingerprint is written to localStorage.
     */
    process.env.RXPOS_DEVICE_FINGERPRINT = deviceId;

    const secrets = loadOrCreateStoreNodeSecrets(userDataDir);

    setupAccessCode = secrets.SETUP_ACCESS_CODE;

    const dbPath = storeNodeDbPath(userDataDir);

    /**
     * Critical:
     *
     * SQLCipher uses the real RX POS device fingerprint.
     */
    const key = deriveStoreNodeDbKey({
      backendDir,

      masterKey: secrets.LOCAL_DB_MASTER_KEY,

      deviceId,
    });

    const { firstRun } = await ensureStoreNodeReady({
      dbPath,
      key,
      backendDir,

      oneShotScriptPath: resourcePaths.oneShotScriptPath,

      electronNativeOverride,

      secrets,

      onLog: logStoreNode,
    });

    if (firstRun) {
      console.log(
        "Store-node: first run — schema pushed to a fresh encrypted local DB.",
      );
    }

    /**
     * The exact same deviceId used for SQLCipher is passed to the backend as
     * SYNC_DEVICE_ID.
     */
    storeNode = await startStoreNode({
      deviceId,

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

  process.env.RXPOS_API_ORIGIN = apiOrigin;

  if (setupAccessCode) {
    process.env.RXPOS_SETUP_ACCESS_CODE = setupAccessCode;
  }

  const dir = bundleDir(process.resourcesPath);

  if (app.isPackaged) {
    const integrity = verifyBundleIntegrity(dir);

    if (!integrity.ok) {
      console.error(
        `Integrity check failed: ${integrity.mismatch ?? "unknown"}`,
      );

      app.quit();

      return;
    }

    const decryptKey = process.env.RENDERER_ENCRYPTION_KEY
      ? keyFromEnv(process.env.RENDERER_ENCRYPTION_KEY)
      : undefined;

    if (bundleIsEncrypted(dir) && !decryptKey) {
      console.error(
        "Renderer is encrypted but RENDERER_ENCRYPTION_KEY is not set — " +
          "refusing to serve undecryptable bundle",
      );

      app.quit();

      return;
    }

    registerAppProtocol(dir, {
      decryptKey,
    });
  }

  createWindow(apiOrigin);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(apiOrigin);
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

let storeNodeStopping = false;

app.on("before-quit", (event) => {
  if (!stopStoreNode || storeNodeStopping) {
    return;
  }

  storeNodeStopping = true;

  event.preventDefault();

  stopStoreNode()
    .catch((err) => console.error("Error stopping store-node backend:", err))
    .finally(() => app.quit());
});
