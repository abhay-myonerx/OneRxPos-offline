import path from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";

// Boots the built app against the dev-server renderer entry (served on :4000 by the
// e2e run script), proving offline-capable load + hardening flags (no Node integration,
// preload bridge exposed).
test("boots and renders the SPA with hardening on", async () => {
  const app = await electron.launch({
    args: [path.join(__dirname, "..", "..", "out", "main.cjs")],
    env: { ...process.env, RXPOS_DEV_SERVER: "http://localhost:4000" },
  });
  const win = await app.firstWindow();
  await expect(win).toHaveTitle(/RX POS/);
  // hardening: renderer must not have Node integration
  const hasRequire = await win.evaluate(
    () => typeof (globalThis as { require?: unknown }).require,
  );
  expect(hasRequire).toBe("undefined");
  // bridge exposed
  const platform = await win.evaluate(
    () =>
      (window as unknown as { rxpos?: { platform?: string } }).rxpos?.platform,
  );
  expect(typeof platform).toBe("string");

  // Sandboxed preloads only see process.env if it was set on the main process before the
  // renderer's OS process was spawned (main.ts sets RXPOS_APP_VERSION at module load, ahead
  // of app.whenReady/createWindow). Assert it actually propagated rather than silently
  // falling back to the preload's "0.0.0" default.
  const appVersion = await win.evaluate(
    () =>
      (window as unknown as { rxpos?: { appVersion?: string } }).rxpos
        ?.appVersion,
  );
  expect(typeof appVersion).toBe("string");
  expect(appVersion).not.toBe("");
  expect(appVersion).not.toBe("0.0.0");

  // SN-5 OPS-1: the store-node's generated setup-access-code (a 64-hex-char
  // random secret — see store-node-config.ts's generateSecret()) reaches
  // window.rxpos.setup.accessCode via the same env-var channel as apiOrigin
  // above: main.ts -> spawned renderer process env -> preload.ts -> the
  // exposed bridge. Proved end to end through a real Electron process here,
  // not just the pure-function buildBridgeStub unit tests.
  const setupAccessCode = await win.evaluate(
    () =>
      (window as unknown as { rxpos?: { setup?: { accessCode?: string | null } } })
        .rxpos?.setup?.accessCode,
  );
  expect(setupAccessCode).toMatch(/^[0-9a-f]{64}$/);

  await app.close();
});

test("main-process hardening flags are applied to the window", async () => {
  const app = await electron.launch({
    args: [path.join(__dirname, "..", "..", "out", "main.cjs")],
    env: { ...process.env, RXPOS_DEV_SERVER: "http://localhost:4000" },
  });
  await app.firstWindow();

  const flags = await app.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    const wcUnknown = w.webContents as unknown as {
      getLastWebPreferences?: () => {
        contextIsolation?: boolean;
        nodeIntegration?: boolean;
        sandbox?: boolean;
      };
    };
    const prefs = wcUnknown.getLastWebPreferences?.();
    return {
      contentProtection: w.isContentProtected(),
      contextIsolation: prefs?.contextIsolation,
      nodeIntegration: prefs?.nodeIntegration,
      sandbox: prefs?.sandbox,
    };
  });

  expect(flags.contentProtection).toBe(true);
  expect(flags.contextIsolation).toBe(true);
  expect(flags.nodeIntegration).toBe(false);
  expect(flags.sandbox).toBe(true);

  await app.close();
});
