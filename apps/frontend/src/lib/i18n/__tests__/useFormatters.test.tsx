import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import i18n from "../i18n";
import { useFormatters } from "../useFormatters";

const norm = (s: string) => s.replace(/ | /g, " ");
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

describe("useFormatters", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("formats money in en-CA by default", () => {
    const { result } = renderHook(() => useFormatters(), { wrapper });
    expect(norm(result.current.money(10.99))).toBe("$10.99");
  });
  it("formats money in fr-CA when language is fr", async () => {
    await i18n.changeLanguage("fr");
    const { result } = renderHook(() => useFormatters(), { wrapper });
    expect(norm(result.current.money(10.99))).toBe("10,99 $");
  });
  it("formats French month names when language is fr", async () => {
    await i18n.changeLanguage("fr");
    const { result } = renderHook(() => useFormatters(), { wrapper });
    expect(result.current.date("2026-01-15", "d MMMM yyyy")).toBe("15 janvier 2026");
  });
});
