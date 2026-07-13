// Minimal ambient declaration for the Electron desktop bridge (`window.rxpos`).
//
// The full `RxposBridge` contract lives in the separate `rx-pos-desktop`
// package (src/bridge/contract.ts) — this frontend has no build-time
// dependency on that package, so it can't import that type directly. This
// declares just enough of the surface the frontend actually touches
// (lane-fingerprint plumbing, Task 11) so `window.rxpos` type-checks here.
//
// `rxpos` itself is optional: in a browser tab / PWA session (no Electron
// preload) `window.rxpos` is simply undefined, which callers must guard
// against with optional chaining (see `getLaneFingerprint` in
// `features/pos-auth/api/pos-auth.api.ts`).
export {};

declare global {
  interface Window {
    rxpos?: {
      // The store-node backend origin the desktop launcher bound this session
      // (a dynamic free port). The SPA prefers this over its build-time
      // VITE_API_URL default so it reaches the just-spawned backend — see
      // `src/shell/env/env.vite.ts`. Absent on plain web/PWA (use VITE_API_URL).
      apiOrigin?: string | null;
      device?: {
        getFingerprint?: () => Promise<string>;
      };
      // SN-5 OPS-1: the store-node's generated SETUP_ACCESS_CODE, surfaced
      // by the desktop preload (rx-pos-desktop/src/bridge/contract.ts's
      // RxposBridge.setup) so the Setup wizard can auto-fill it instead of
      // requiring the operator to hunt for/transcribe it. `null`/absent in
      // every non-desktop context (plain web/PWA) — callers must guard with
      // optional chaining, same as device.getFingerprint above.
      setup?: {
        accessCode?: string | null;
      };
    };
  }
}
