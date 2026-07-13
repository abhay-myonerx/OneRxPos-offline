import { describe, it, expect, beforeEach } from "vitest";
import { LOCALE_STORAGE_KEY, readStoredLocale, writeStoredLocale } from "../locale-storage";

describe("locale storage", () => {
  beforeEach(() => window.localStorage.clear());

  it("defaults to en when nothing stored", () => {
    expect(readStoredLocale()).toBe("en");
  });
  it("round-trips a written locale", () => {
    writeStoredLocale("fr");
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("fr");
    expect(readStoredLocale()).toBe("fr");
  });
  it("ignores a corrupt stored value", () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "de");
    expect(readStoredLocale()).toBe("en");
  });
});
