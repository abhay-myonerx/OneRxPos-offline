import type { RxposBridge, LicenseStatus } from "./contract";

const UNLICENSED: LicenseStatus = { status: "unlicensed", plan: null, graceExpiresAt: null };

// Stable stub fingerprint so tests/dev builds without a real preload still get a
// deterministic 64-hex value from device.getFingerprint(). This is the
// PRECOMPUTED sha256 of computeFingerprint({hostname:"stub", mac:"00:..:00",
// platform:"stub", cpu:"stub"}) — inlined as a literal rather than computed
// here so this module (which the SANDBOXED preload bundles) never has to
// `require("node:crypto")`, which fails to load in a sandboxed preload and
// takes the entire window.rxpos bridge down with it. The real per-lane
// fingerprint is computed in the MAIN process and threaded in via
// buildBridgeStub's getFingerprint (see preload.ts / main.ts).
const STUB_FINGERPRINT =
  "547842aa4408f2d831e498a7fde0b7b3a26110c9d7483b9132a7bf3f37ad306f";

// Pure builder (testable without Electron). preload.ts wires the real platform/version/fetch.
export function buildBridgeStub(opts: {
  platform: NodeJS.Platform;
  appVersion: string;
  isKiosk: boolean;
  fetchStatus: () => Promise<LicenseStatus>;
  getFingerprint?: () => Promise<string>;
  // SN-5 OPS-1: the store-node's generated SETUP_ACCESS_CODE (see
  // preload.ts), so the frontend Setup wizard can auto-fill it instead of
  // requiring manual transcription. Omitted/undefined -> null, matching the
  // web/PWA build where this bridge doesn't exist at all.
  setupAccessCode?: string | null;
  // The store-node backend origin (see RxposBridge.apiOrigin). preload.ts
  // passes process.env.RXPOS_API_ORIGIN; omitted/undefined -> null (web/PWA).
  apiOrigin?: string | null;
}): RxposBridge {
  return {
    platform: opts.platform,
    appVersion: opts.appVersion,
    isKiosk: opts.isKiosk,
    apiOrigin: opts.apiOrigin ?? null,
    hardware: {
      printReceipt: async () => ({ ok: false, reason: "not-implemented" }),
      openCashDrawer: async () => ({ ok: false, reason: "not-implemented" }),
    },
    license: {
      getStatus: async () => {
        try {
          return await opts.fetchStatus();
        } catch {
          return UNLICENSED;
        }
      },
    },
    device: {
      getFingerprint: opts.getFingerprint ?? (async () => STUB_FINGERPRINT),
    },
    setup: {
      accessCode: opts.setupAccessCode ?? null,
    },
  };
}
