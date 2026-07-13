import path from "node:path";

// Fixed host for the packaged-bundle origin. It MUST be a real host segment
// (not the filename) so the document loads at `app://bundle/index.html` and the
// SPA's relative assets resolve to `app://bundle/assets/...`. The earlier
// `app://index.html` made "index.html" the HOST, so `./assets/x.js` resolved to
// `app://index.html/assets/x.js` — which the protocol handler mapped to
// bundleDir/index.html/assets/x.js (404), leaving the renderer blank. The host
// is a constant anchor only; resolveRequestPath resolves files by PATHNAME.
export const APP_BUNDLE_HOST = "bundle";

// Dev -> Vite dev server (HMR); Prod -> app:// serving the packaged bundle.
export function resolveEntry(opts: {
  isPackaged: boolean;
  devServerUrl: string;
}): { mode: "dev" | "prod"; url: string } {
  return opts.isPackaged
    ? { mode: "prod", url: `app://${APP_BUNDLE_HOST}/index.html` }
    : { mode: "dev", url: opts.devServerUrl };
}

// Where the renderer dist lives inside the packaged app (electron-builder extraResources).
export function bundleDir(resourcesPath: string): string {
  return path.join(resourcesPath, "renderer");
}
