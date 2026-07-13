/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  // Relative asset URLs so the Electron app:// / file:// loader resolves them offline.
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    // PWA-1 (store-node plan): installable thin online client for tablets.
    // Only wired into the Vite SPA build — the Next.js shell (next.config.ts)
    // is untouched, so `next build` is unaffected by this plugin.
    VitePWA({
      registerType: "autoUpdate",
      // The SPA is served with a relative base (`base: "./"`) and uses a hash
      // router (src/main.tsx: createHashRouter) so every route lives on the
      // same document — "./" is correct for both start_url and scope and
      // needs no rewriting as routes are added.
      manifest: {
        name: "RX POS",
        short_name: "RX POS",
        description: "RX POS — point of sale, thin online client for store-node / cloud API.",
        start_url: "./",
        scope: "./",
        display: "standalone",
        orientation: "any",
        // Brand primary-600 / neutral-50 — see src/app/globals.css
        // (--color-primary-600, --color-neutral-50).
        theme_color: "#3b5bdb",
        background_color: "#fafafa",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          {
            src: "icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // The app-shell chunk is ~2MB (a full offline POS: all routes, RTK
        // Query, redux). That's legitimate for a disk-loaded Electron app and
        // acceptable to precache for the tablet PWA, but it exceeds Workbox's
        // default 2 MiB precache cap — which this plugin treats as a FATAL
        // build error, not a warning. Raise the cap to 4 MiB so app-shell
        // growth doesn't break the packaged build. Heavy, rarely-used libs
        // (xlsx, html2canvas) are already dynamic-imported into their own lazy
        // chunks and stay out of this precache regardless.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // vite-plugin-pwa's default globPatterns already cover
        // js/css/html/svg/png/ico/woff2 — app-shell precache needs nothing
        // extra here, so this is left at the default intentionally.
        //
        // Cold launch must resolve to the shell without a network round-trip:
        // any navigation request that isn't precached (e.g. deep link on
        // first paint) falls back to the precached index.html.
        navigateFallback: "index.html",
        runtimeCaching: [
          {
            // Data freshness first, but the shell must still work if the
            // store-node / cloud API is briefly unreachable — NetworkFirst
            // with a short timeout falls back to the last cached response.
            // Workbox's NetworkFirst only ever intercepts GET by default, so
            // mutations (POST/PUT/PATCH/DELETE) are never routed through this
            // cache regardless of urlPattern.
            urlPattern: ({ url, request }) =>
              request.method === "GET" &&
              url.pathname.includes("/api/") &&
              // Never cache auth: tokens/session state must always hit the
              // network, never be served stale from an offline cache.
              !url.pathname.includes("/api/v1/auth/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "api-network-first",
              networkTimeoutSeconds: 4,
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      // Dual-shell swaps: the SPA build uses the React-Router / Vite-env variants.
      // These specific keys MUST precede the bare "@" — Vite resolves aliases in
      // declaration order via startsWith, so a broad "@" would otherwise shadow them.
      "@/shell/nav": `${src}/shell/nav/nav.router.tsx`,
      "@/shell/media": `${src}/shell/media/media.router.tsx`,
      "@/shell/env": `${src}/shell/env/env.vite.ts`,
      "@": src,
    },
  },
  server: { port: 4000, strictPort: true },
  build: { outDir: "dist" },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // why: this repo lives on a slow disk (Vite warns "Slow filesystem
    // detected"), and running test files in parallel causes filesystem/CPU
    // contention that intermittently times out the async redirect-guard
    // assertions in the route smoke tests. The suite is small, so running
    // files serially costs negligible wall-clock time and removes the flake.
    fileParallelism: false,
  },
});
