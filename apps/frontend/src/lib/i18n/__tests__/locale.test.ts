import { describe, it, expect } from "vitest";
import { enCA, frCA } from "date-fns/locale";
import { bcp47, dateFnsLocale, isLocale, LOCALES } from "../locale";

describe("locale primitives", () => {
  it("maps to BCP-47 Canadian tags", () => {
    expect(bcp47("en")).toBe("en-CA");
    expect(bcp47("fr")).toBe("fr-CA");
  });
  it("maps to date-fns Canadian locales", () => {
    expect(dateFnsLocale("en")).toBe(enCA);
    expect(dateFnsLocale("fr")).toBe(frCA);
  });
  it("guards unknown values", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(true);
    expect(isLocale("de")).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(isLocale(123)).toBe(false);
  });
  it("exposes the supported set", () => {
    expect([...LOCALES]).toEqual(["en", "fr"]);
  });
});
