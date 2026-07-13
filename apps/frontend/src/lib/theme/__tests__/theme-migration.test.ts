import { describe, it, expect, beforeEach } from "vitest";
import { readStoredThemeMode, THEME_STORAGE_KEY, LEGACY_THEME_STORAGE_KEY } from "../theme";

const LEGACY = LEGACY_THEME_STORAGE_KEY;

describe("theme key migration", () => {
  beforeEach(() => window.localStorage.clear());
  it("migrates a legacy value to the new key on read", () => {
    window.localStorage.setItem(LEGACY, "dark");
    expect(readStoredThemeMode()).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(window.localStorage.getItem(LEGACY)).toBeNull(); // legacy removed
  });
  it("uses the new key directly when present", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    expect(readStoredThemeMode()).toBe("light");
  });
  it("defaults to system when neither key is set", () => {
    expect(readStoredThemeMode()).toBe("system");
  });
  it("does NOT migrate a corrupt legacy value into the new key", () => {
    window.localStorage.setItem(LEGACY, "blue");
    expect(readStoredThemeMode()).toBe("system"); // default
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull(); // garbage not persisted
  });
});
