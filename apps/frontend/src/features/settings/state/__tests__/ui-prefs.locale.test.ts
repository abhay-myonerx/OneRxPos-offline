import { describe, it, expect } from "vitest";
import reducer, { setLocale } from "../ui-prefs.slice";

describe("uiPrefs locale", () => {
  it("defaults locale to en", () => {
    const s = reducer(undefined, { type: "@@INIT" });
    expect(s.locale).toBe("en");
  });
  it("setLocale updates the locale", () => {
    const s = reducer(undefined, setLocale("fr"));
    expect(s.locale).toBe("fr");
  });
});
