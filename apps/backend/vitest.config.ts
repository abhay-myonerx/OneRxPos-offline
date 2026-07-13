// vitest.config.ts

import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: [
      "src/**/*.{test,spec}.ts",
      "tests/**/*.{test,spec}.ts",
      "scripts/**/*.{test,spec}.ts",
    ],
    exclude: ["node_modules/**", "dist/**", "src/generated/**"],
    // Stamps env vars consumed by `src/config/index.ts` at module
    // load. See `src/test-env.ts` for the placeholder values.
    setupFiles: ["./src/test-env.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@config": path.resolve(__dirname, "src/config"),
      "@modules": path.resolve(__dirname, "src/modules"),
      "@shared": path.resolve(__dirname, "src/shared"),
      "@middleware": path.resolve(__dirname, "src/middleware"),
    },
  },
});
