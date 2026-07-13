import { describe, it, expect } from "vitest";
import { reorderSchema } from "../reorder";
import { readReorderSettings, mergeSettings } from "../index";

describe("reorder settings", () => {
  it("defaults both toggles off", () => {
    const s = reorderSchema.parse({});
    expect(s.autoReorderEnabled).toBe(false);
    expect(s.autoEmailReorder).toBe(false);
  });

  it("reads tolerant defaults from a tenant record", () => {
    expect(readReorderSettings({ settings: {} }).autoReorderEnabled).toBe(false);
    expect(
      readReorderSettings({ settings: { reorder: { autoReorderEnabled: true } } }).autoReorderEnabled,
    ).toBe(true);
  });

  it("merges the reorder namespace without touching others", () => {
    const merged = mergeSettings(
      { notifications: { emailEnabled: true } },
      { reorder: { autoReorderEnabled: true } },
    );
    expect((merged.reorder as { autoReorderEnabled: boolean }).autoReorderEnabled).toBe(true);
    expect((merged.notifications as { emailEnabled: boolean }).emailEnabled).toBe(true);
  });
});
