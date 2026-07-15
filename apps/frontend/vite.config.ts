/// <reference types="vitest/config" />

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig(({ mode }) => {
  const isElectronBuild = mode === "electron";

  return {
    base: "./",

    plugins: [
      react(),

      tailwindcss(),

      VitePWA({
        /*
         * Browser / tablet SPA:
         *
         * vite-plugin-pwa automatically
         * registers the service worker.
         *
         * Electron:
         *
         * The renderer runs under:
         *
         * app://bundle
         *
         * Chromium does not support
         * ServiceWorker registration for
         * this custom protocol.
         */
        injectRegister: isElectronBuild ? false : "auto",

        registerType: "autoUpdate",

        manifest: {
          name: "RX POS",

          short_name: "RX POS",

          description: "RX POS — point of sale, thin online client for store-node / cloud API.",

          start_url: "./",

          scope: "./",

          display: "standalone",

          orientation: "any",

          theme_color: "#3b5bdb",

          background_color: "#fafafa",

          icons: [
            {
              src: "icon-192.png",

              sizes: "192x192",

              type: "image/png",

              purpose: "any",
            },

            {
              src: "icon-512.png",

              sizes: "512x512",

              type: "image/png",

              purpose: "any",
            },

            {
              src: "icon-512-maskable.png",

              sizes: "512x512",

              type: "image/png",

              purpose: "maskable",
            },
          ],
        },

        workbox: {
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,

          navigateFallback: "index.html",

          runtimeCaching: [
            {
              urlPattern: ({ url, request }) =>
                request.method === "GET" &&
                url.pathname.includes("/api/") &&
                !url.pathname.includes("/api/v1/auth/"),

              handler: "NetworkFirst",

              options: {
                cacheName: "api-network-first",

                networkTimeoutSeconds: 4,

                cacheableResponse: {
                  statuses: [0, 200],
                },

                expiration: {
                  maxEntries: 200,

                  maxAgeSeconds: 60 * 60 * 24,
                },
              },
            },
          ],
        },
      }),
    ],

    resolve: {
      alias: {
        "@/shell/nav": `${src}/shell/nav/nav.router.tsx`,

        "@/shell/media": `${src}/shell/media/media.router.tsx`,

        "@/shell/env": `${src}/shell/env/env.vite.ts`,

        "@": src,
      },
    },

    server: {
      port: 4000,

      strictPort: true,
    },

    build: {
      outDir: "dist",
    },

    test: {
      environment: "jsdom",

      globals: true,

      setupFiles: ["./vitest.setup.ts"],

      include: ["src/**/*.{test,spec}.{ts,tsx}"],

      fileParallelism: false,
    },
  };
});
