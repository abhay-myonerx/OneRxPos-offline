import { describe, it, expect } from "vitest";
import {
  PAYMENT_PROVIDERS,
  getPaymentProvider,
  listPaymentProviders,
} from "../../src/payment/providers";
import { createTerminal } from "../../src/payment/terminal-factory";
import { MockTerminal } from "../../src/payment/mock-terminal";
import { HttpTerminalAdapter } from "../../src/payment/http-terminal";

describe("payment provider registry", () => {
  it("includes all major North-American / Canadian processors", () => {
    const ids = PAYMENT_PROVIDERS.map((p) => p.id);
    for (const id of [
      "mock",
      "moneris",
      "globalpay",
      "tdmerchant",
      "chase",
      "elavon",
      "fiserv",
      "worldpay",
      "helcim",
      "worldline",
      "adyen",
      "stripe",
      "square",
      "clover",
    ]) {
      expect(ids, `missing provider "${id}"`).toContain(id);
    }
  });

  it("every provider has honest readiness + connection metadata", () => {
    for (const p of PAYMENT_PROVIDERS) {
      expect(["ready", "configurable", "sdk-required"]).toContain(p.readiness);
      expect(p.connectionModels.length).toBeGreaterThan(0);
      expect(p.regions.length).toBeGreaterThan(0);
    }
  });

  it("listPaymentProviders is serializable (drops the mapResponse function)", () => {
    const infos = listPaymentProviders();
    expect(infos.length).toBe(PAYMENT_PROVIDERS.length);
    expect(infos.every((i) => !("mapResponse" in i))).toBe(true);
    expect(() => JSON.stringify(infos)).not.toThrow();
  });

  it("getPaymentProvider resolves by id", () => {
    expect(getPaymentProvider("moneris")?.label).toBe("Moneris");
    expect(getPaymentProvider("nope")).toBeUndefined();
  });
});

describe("createTerminal — registry dispatch", () => {
  it("mock → MockTerminal", () => {
    expect(createTerminal({ processor: "mock" })).toBeInstanceOf(MockTerminal);
  });

  it("HTTP acquirer + gateway URL → HttpTerminalAdapter", () => {
    const t = createTerminal({ processor: "moneris", http: { baseUrl: "https://esqa.example" } });
    expect(t).toBeInstanceOf(HttpTerminalAdapter);
  });

  it("HTTP acquirer WITHOUT a gateway → MockTerminal (safe setup fallback)", () => {
    expect(createTerminal({ processor: "globalpay" })).toBeInstanceOf(MockTerminal);
  });

  it("device-SDK provider throws a clear error", () => {
    expect(() => createTerminal({ processor: "stripe" })).toThrow(/device SDK/i);
    expect(() => createTerminal({ processor: "square" })).toThrow(/device SDK/i);
  });
});
