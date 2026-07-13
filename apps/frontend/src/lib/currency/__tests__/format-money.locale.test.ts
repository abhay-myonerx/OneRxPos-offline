import { describe, it, expect } from "vitest";
import { formatMoney } from "../format-money";

// Normalize non-breaking spaces (Intl uses U+00A0 / U+202F) so assertions are stable.
const norm = (s: string) => s.replace(/[  ]/g, " ");

describe("formatMoney locale awareness", () => {
  it("formats fr-CA CAD as '10,99 $'", () => {
    expect(norm(formatMoney(10.99, { locale: "fr-CA", currency: "CAD" }))).toBe("10,99 $");
  });
  it("formats en-CA CAD as '$10.99'", () => {
    expect(norm(formatMoney(10.99, { locale: "en-CA", currency: "CAD" }))).toBe("$10.99");
  });
  it("defaults to CAD / en-CA", () => {
    expect(norm(formatMoney(1234.5))).toBe("$1,234.50");
  });
  it("returns em-dash for invalid input", () => {
    expect(formatMoney(null)).toBe("—");
  });
});
