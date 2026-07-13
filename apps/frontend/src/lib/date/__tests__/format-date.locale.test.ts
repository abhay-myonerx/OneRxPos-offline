import { describe, it, expect } from "vitest";
import { frCA, enCA } from "date-fns/locale";
import { formatDate } from "../format-date";

describe("formatDate locale awareness", () => {
  it("formats month names in French with frCA", () => {
    expect(formatDate("2026-01-15", "d MMMM yyyy", frCA)).toBe("15 janvier 2026");
  });
  it("formats month names in English with enCA", () => {
    expect(formatDate("2026-01-15", "MMMM d, yyyy", enCA)).toBe("January 15, 2026");
  });
  it("is backward compatible (English default when no locale)", () => {
    expect(formatDate("2026-01-15")).toBe("Jan 15, 2026");
  });
  it("returns em-dash for invalid input", () => {
    expect(formatDate("not-a-date")).toBe("—");
  });
});
