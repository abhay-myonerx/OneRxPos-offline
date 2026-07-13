/// <reference types="vite/client" />
import type { AppEnv } from "./types";

// The Electron desktop launcher binds the store-node to a DYNAMIC free port at
// boot and exposes that origin via the preload bridge (window.rxpos.apiOrigin).
// The SPA must prefer it over the build-time VITE_API_URL default — otherwise a
// packaged renderer talks to the wrong (:4001) port and can't reach its own
// backend. On plain web/PWA there is no bridge, so VITE_API_URL is used.
function resolveApiUrl(): string {
  const bridgeOrigin =
    typeof window !== "undefined" ? window.rxpos?.apiOrigin : null;
  if (bridgeOrigin) return `${bridgeOrigin}/api/v1`;
  return import.meta.env.VITE_API_URL || "http://localhost:4001/api/v1";
}

// Vite/SPA shell: values inlined from VITE_* at build time.
export const env: AppEnv = {
  apiUrl: resolveApiUrl(),
  cloudinaryCloudName: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || "",
  cloudinaryUploadPreset: import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || "",
};
