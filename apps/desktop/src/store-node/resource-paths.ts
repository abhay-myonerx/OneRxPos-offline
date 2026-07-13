// SN-5 Task 3: resolves every filesystem path main.ts needs to spawn the
// store-node backend, branching on `app.isPackaged`.
//
// Dev layout (unpackaged): rx-pos-backend is a SIBLING repo checkout, and the
// native/ + scripts/ helpers live inside this repo's own project root
// (`app.getAppPath()` — the directory containing rx-pos-desktop's
// package.json when running unpackaged).
//
// Packaged layout: electron-builder's `extraResources` (electron-builder.yml)
// copies a flattened, portable staging copy of the backend
// (scripts/prepare-backend-resources.mjs's `.staging/backend` output — see
// its header comment for why the copy is flattened rather than a raw
// `../rx-pos-backend` symlink-following copy) to `resourcesPath/backend`, the
// desktop-owned Electron ABI-146 native module copy to
// `resourcesPath/native/node_modules`, and the `--require` hook + schema-push
// one-shot script to `resourcesPath/scripts/*`. None of these live inside the
// asar (`app.getAppPath()` would resolve *inside* app.asar once packaged,
// which the spawned electron-as-node children — separate processes — cannot
// reliably read native modules or `--require` a hook script out of), which is
// exactly why this split exists instead of just using `app.getAppPath()`
// unconditionally.
//
// A pure function (no Electron imports) so it's directly unit-testable
// without mocking `app`.
import path from "node:path";

export interface StoreNodeResourcePaths {
  /** rx-pos-backend repo root (dev) or its staged copy (packaged) — passed as both `backendDir` and the spawned child's `cwd`. */
  backendDir: string;
  /** Directory containing the Electron ABI-146 `better-sqlite3-multiple-ciphers` build (WATCH-SN4-1). */
  nativeDir: string;
  /** `--require` hook that redirects the spawned child's native require to `sqlcipherEntry`. */
  hookPath: string;
  /** The one-shot schema-push script (onboarding.ts). */
  oneShotScriptPath: string;
  /** `nativeDir`'s `better-sqlite3-multiple-ciphers` entry — the override target the hook redirects to. */
  sqlcipherEntry: string;
  /**
   * SN-5 bundle+harden pass: the store-node server's entry point to spawn.
   * Dev (unpackaged): `dist/server.js`, tsc's plain build output, for a fast
   * inner loop (no bundling step between `npm run build` and a relaunch).
   * Packaged: `server.bundle.cjs` — a single minified (and, unless
   * `RXPOS_SKIP_OBFUSCATE=1` was set at package time, obfuscated) CJS
   * bundle produced by scripts/bundle-backend.mjs from that same
   * `dist/server.js`, staged at the backend root
   * (`scripts/prepare-backend-resources.mjs`'s Step 9). Both launcher.ts's
   * `startStoreNode` and the packaged-acceptance test spawn THIS path
   * instead of hand-rolling `path.join(backendDir, "dist", "server.js")`,
   * so packaged builds actually exercise the bundle, not the loose source
   * it was built from (which Step 9 deletes from the packaged resources
   * anyway — see bundle-backend.mjs's header for exactly what survives
   * unbundled and why).
   */
  serverEntry: string;
}

export interface ResolveStoreNodeResourcePathsOptions {
  /** `app.isPackaged`. */
  isPackaged: boolean;
  /** `app.getAppPath()`. */
  appPath: string;
  /** `process.resourcesPath`. Only consulted when `isPackaged` is true. */
  resourcesPath: string;
}

export function resolveStoreNodeResourcePaths(
  opts: ResolveStoreNodeResourcePathsOptions,
): StoreNodeResourcePaths {
  const root = opts.isPackaged ? opts.resourcesPath : opts.appPath;

  const backendDir = opts.isPackaged
  ? path.join(root, "backend")
  : path.resolve(root, "..", "backend");
  const nativeDir = path.join(root, "native", "node_modules");

  return {
    backendDir,
    nativeDir,
    hookPath: path.join(root, "scripts", "electron-native-require-hook.cjs"),
    oneShotScriptPath: path.join(root, "scripts", "push-sqlite-schema-oneshot.cjs"),
    sqlcipherEntry: path.join(nativeDir, "better-sqlite3-multiple-ciphers"),
    serverEntry: opts.isPackaged
      ? path.join(backendDir, "server.bundle.cjs")
      : path.join(backendDir, "dist", "server.js"),
  };
}
