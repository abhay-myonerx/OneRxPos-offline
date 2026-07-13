import { describe, it, expect, beforeEach } from "vitest";
import { readStoredLocale, LOCALE_STORAGE_KEY, LEGACY_LOCALE_STORAGE_KEY } from "../locale-storage";

const LEGACY = LEGACY_LOCALE_STORAGE_KEY;

describe("locale key migration", () => {
  beforeEach(() => window.localStorage.clear());
  it("migrates a legacy value to the new key on read", () => {
    window.localStorage.setItem(LEGACY, "fr");
    expect(readStoredLocale()).toBe("fr");
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("fr");
    expect(window.localStorage.getItem(LEGACY)).toBeNull();
  });
  it("uses the new key directly when present", () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    expect(readStoredLocale()).toBe("en");
  });
  it("defaults to en when neither key is set", () => {
    expect(readStoredLocale()).toBe("en");
  });
  it("does NOT migrate a corrupt legacy value into the new key", () => {
    window.localStorage.setItem(LEGACY, "xx");
    expect(readStoredLocale()).toBe("en"); // default
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull(); // garbage not persisted
  });
});
