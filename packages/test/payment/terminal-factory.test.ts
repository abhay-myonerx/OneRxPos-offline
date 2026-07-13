import { describe, it, expect } from "vitest";
import { createTerminal } from "../../src/payment/terminal-factory";
import { MockTerminal } from "../../src/payment/mock-terminal";
import { HttpTerminalAdapter } from "../../src/payment/http-terminal";

describe("createTerminal", () => {
  it("returns a MockTerminal for the mock processor", () => {
    expect(createTerminal({ processor: "mock" })).toBeInstanceOf(MockTerminal);
  });

  it("returns an HTTP adapter for a real processor with an http config", () => {
    const t = createTerminal({ processor: "moneris", http: { baseUrl: "https://esqa.moneris.com/pos" } });
    expect(t).toBeInstanceOf(HttpTerminalAdapter);
  });

  it("falls back to mock when a real processor has no http config", () => {
    expect(createTerminal({ processor: "moneris" })).toBeInstanceOf(MockTerminal);
  });
});
