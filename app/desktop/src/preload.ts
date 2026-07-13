import { contextBridge } from "electron";
import { buildBridgeStub } from "./bridge/stub";
import type { LicenseStatus } from "./bridge/contract";

// This preload runs SANDBOXED (window-options.ts sets sandbox:true), so it must
// NOT require any Node builtin (node:crypto / node:os / node:fs …) — doing so
// throws "module not found" and Electron abandons the whole preload, leaving
// window.rxpos undefined. That's why the device fingerprint (which needs
// node:crypto + node:os) is computed in the MAIN process and passed in via
// RXPOS_DEVICE_FINGERPRINT below, instead of imported here.
//
// Kiosk flag is passed from main via an env var set on the child (process.env in
// preload reflects the main process env under sandbox). appVersion via env too.
const apiOrigin = process.env.RXPOS_API_ORIGIN ?? "http://localhost:4001";
const statusUrl = apiOrigin + "/api/v2/license/status";
const deviceFingerprint = process.env.RXPOS_DEVICE_FINGERPRINT ?? null;

const bridge = buildBridgeStub({
  platform: process.platform,
  appVersion: process.env.RXPOS_APP_VERSION ?? "0.0.0",
  isKiosk: process.env.RXPOS_KIOSK === "1",
  // Surface the dynamically-bound store-node origin so the SPA reaches the
  // just-spawned backend on its free port instead of the build-time :4001.
  apiOrigin,
  fetchStatus: async (): Promise<LicenseStatus> => {
    const r = await fetch(statusUrl);
    const j = (await r.json()) as { data: LicenseStatus };
    return j.data;
  },
  // Precomputed in main (needs node:crypto/os, unavailable in this sandbox).
  // Omitted -> buildBridgeStub falls back to its stub constant.
  getFingerprint: deviceFingerprint ? async () => deviceFingerprint : undefined,
  // SN-5 OPS-1: same channel as RXPOS_API_ORIGIN above — main.ts sets this
  // env var on the main process (from the store-node's generated
  // SETUP_ACCESS_CODE) before createWindow(), and Electron's renderer
  // process inherits it, so it's readable here at preload load time.
  setupAccessCode: process.env.RXPOS_SETUP_ACCESS_CODE ?? null,
});

contextBridge.exposeInMainWorld("rxpos", bridge);
