"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/preload.ts
var import_electron = require("electron");

// src/security/device-fingerprint.ts
var import_node_crypto = require("node:crypto");
var import_node_os = __toESM(require("node:os"));
function computeFingerprint(sources) {
  const norm = (v) => v.trim().toUpperCase();
  const payload = ["hostname", "mac", "platform", "cpu"].map((k) => `${k}=${norm(sources[k])}`).join("|");
  return (0, import_node_crypto.createHash)("sha256").update(payload).digest("hex");
}
function firstPhysicalMac() {
  const ifaces = import_node_os.default.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name] ?? []) {
      if (!ni.internal && ni.mac && ni.mac !== "00:00:00:00:00:00") return ni.mac;
    }
  }
  return "";
}
function gatherSources() {
  return {
    hostname: import_node_os.default.hostname() ?? "",
    mac: firstPhysicalMac(),
    platform: import_node_os.default.platform(),
    cpu: import_node_os.default.cpus()[0]?.model ?? ""
  };
}
async function getDeviceFingerprint() {
  return computeFingerprint(gatherSources());
}

// src/bridge/stub.ts
var UNLICENSED = { status: "unlicensed", plan: null, graceExpiresAt: null };
var STUB_FINGERPRINT = computeFingerprint({
  hostname: "stub",
  mac: "00:00:00:00:00:00",
  platform: "stub",
  cpu: "stub"
});
function buildBridgeStub(opts) {
  return {
    platform: opts.platform,
    appVersion: opts.appVersion,
    isKiosk: opts.isKiosk,
    apiOrigin: opts.apiOrigin ?? null,
    hardware: {
      printReceipt: async () => ({ ok: false, reason: "not-implemented" }),
      openCashDrawer: async () => ({ ok: false, reason: "not-implemented" })
    },
    license: {
      getStatus: async () => {
        try {
          return await opts.fetchStatus();
        } catch {
          return UNLICENSED;
        }
      }
    },
    device: {
      getFingerprint: opts.getFingerprint ?? (async () => STUB_FINGERPRINT)
    },
    setup: {
      accessCode: opts.setupAccessCode ?? null
    }
  };
}

// src/preload.ts
var apiOrigin = process.env.RXPOS_API_ORIGIN ?? "http://localhost:4001";
var statusUrl = apiOrigin + "/api/v2/license/status";
var bridge = buildBridgeStub({
  platform: process.platform,
  appVersion: process.env.RXPOS_APP_VERSION ?? "0.0.0",
  isKiosk: process.env.RXPOS_KIOSK === "1",
  // Surface the dynamically-bound store-node origin so the SPA reaches the
  // just-spawned backend on its free port instead of the build-time :4001.
  apiOrigin,
  fetchStatus: async () => {
    const r = await fetch(statusUrl);
    const j = await r.json();
    return j.data;
  },
  getFingerprint: getDeviceFingerprint,
  // SN-5 OPS-1: same channel as RXPOS_API_ORIGIN above — main.ts sets this
  // env var on the main process (from the store-node's generated
  // SETUP_ACCESS_CODE) before createWindow(), and Electron's renderer
  // process inherits it, so it's readable here at preload load time.
  setupAccessCode: process.env.RXPOS_SETUP_ACCESS_CODE ?? null
});
import_electron.contextBridge.exposeInMainWorld("rxpos", bridge);
//# sourceMappingURL=preload.cjs.map
