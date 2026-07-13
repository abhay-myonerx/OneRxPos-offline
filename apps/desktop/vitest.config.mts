import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/unit/**/*.test.ts", "src/**/__tests__/**/*.test.ts"],
    // No unit tests exist yet in this scaffold task; later tasks add them.
    passWithNoTests: true,
  },
});
