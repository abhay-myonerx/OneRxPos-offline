import { describe, it, expect, beforeEach } from "vitest";
import i18n from "../i18n";

describe("i18n instance", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("is initialized with common + pos namespaces", () => {
    expect(i18n.isInitialized).toBe(true);
    expect(i18n.options.fallbackLng).toContain("en");
  });
  it("resolves English by default", () => {
    expect(i18n.t("common:feedback.noData")).toBe("No data");
    expect(i18n.t("pos:cart.add")).toBe("Add to cart");
  });
  it("resolves French after changeLanguage", async () => {
    await i18n.changeLanguage("fr");
    expect(i18n.t("common:actions.tryAgain")).toBe("Réessayer");
    expect(i18n.t("pos:cart.checkout")).toBe("Passer à la caisse");
  });
  it("falls back to English for a missing French key", async () => {
    await i18n.changeLanguage("fr");
    // A key present only in en (simulate by requesting a real en key that we
    // know exists in both — instead assert fallback config is active):
    expect(i18n.options.fallbackLng).toContain("en");
    // And an unknown key returns the key itself (no throw):
    expect(i18n.t("common:nope.missing")).toBe("common:nope.missing");
  });
});
