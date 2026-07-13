import { describe, expect, it } from "vitest";
import { createLocalStore, initSchema } from "@/local";
import { createSyncClient, freshnessFromLastSync, resolveConflict } from "@/sync";

describe("local/sync public barrels", () => {
  it("re-exports the LocalStore surface from @/local", () => {
    expect(typeof createLocalStore).toBe("function");
    expect(typeof initSchema).toBe("function");
  });

  it("re-exports the SyncClient surface from @/sync", () => {
    expect(typeof createSyncClient).toBe("function");
    expect(typeof resolveConflict).toBe("function");
    expect(typeof freshnessFromLastSync).toBe("function");
  });
});
