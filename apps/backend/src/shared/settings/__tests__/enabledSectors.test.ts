import { describe, it, expect } from "vitest";
import { DEFAULT_ENABLED_SECTORS } from "../enabledSectors";
import { readEnabledSectors, mergeSettings } from "../index";

describe("enabledSectors settings", () => {
  it("defaults every sector to false (opt-in)", () => {
    expect(readEnabledSectors({ settings: {} })).toEqual(DEFAULT_ENABLED_SECTORS);
    expect(DEFAULT_ENABLED_SECTORS.sample).toBe(false);
    expect(DEFAULT_ENABLED_SECTORS.pharmacy).toBe(false);
  });
  it("reads an explicitly-enabled sector", () => {
    const t = { settings: { enabledSectors: { sample: true } } };
    expect(readEnabledSectors(t).sample).toBe(true);
    expect(readEnabledSectors(t).pharmacy).toBe(false);
  });
  it("mergeSettings toggles a sector and leaves other namespaces untouched", () => {
    const current = { hr: { payrollCycle: "MONTHLY" } };
    const next = mergeSettings(current, { enabledSectors: { sample: true } });
    expect((next.enabledSectors as Record<string, boolean>).sample).toBe(true);
    expect(next.hr).toEqual({ payrollCycle: "MONTHLY" }); // preserved
  });
});
