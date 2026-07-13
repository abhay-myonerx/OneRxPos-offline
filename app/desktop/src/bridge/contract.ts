// The window.rxpos surface. Hardware is a STUB in 0.3; real drivers (Phase 1)
// implement these same signatures. License is real (backed by fetch) as of Phase 0.5.
export type LicenseStatus = {
  status: "active" | "degraded" | "locked" | "unlicensed";
  plan: string | null;
  graceExpiresAt: number | null;
};

export interface RxposBridge {
  platform: NodeJS.Platform;
  appVersion: string;
  isKiosk: boolean;
  // The origin (scheme://host:port) of the store-node backend this renderer
  // must talk to. The launcher binds a DYNAMIC free port at boot, so the SPA
  // cannot hardcode it — main.ts sets RXPOS_API_ORIGIN on the main process
  // before createWindow(), preload reads it off process.env, and the SPA
  // (env.vite.ts) prefers this over its build-time VITE_API_URL default.
  // `null` on plain web/PWA where there is no bridge (SPA uses VITE_API_URL).
  apiOrigin: string | null;
  hardware: {
    printReceipt(
      payload: unknown,
    ): Promise<{ ok: false; reason: "not-implemented" }>;
    openCashDrawer(): Promise<{ ok: false; reason: "not-implemented" }>;
  };
  license: {
    getStatus(): Promise<LicenseStatus>;
  };
  device: {
    getFingerprint(): Promise<string>;
  };
  setup: {
    // SN-5 OPS-1: the store-node generates its own SETUP_ACCESS_CODE (see
    // store-node-config.ts) and has no "server administrator" to hand it to
    // the operator separately — the operator IS the person standing at this
    // device. main.ts threads the value through the same env-var channel it
    // already uses for RXPOS_API_ORIGIN (set on the main process before
    // createWindow(), inherited by the renderer's process.env), and this
    // bridge surfaces it so the frontend Setup wizard can auto-fill it
    // instead of requiring the operator to hunt for/transcribe it.
    // `null` in every non-desktop context (plain web/PWA) and in a desktop
    // build if the secrets file couldn't be read for some reason — the
    // wizard falls back to its normal manual-entry field in that case.
    accessCode: string | null;
  };
}
