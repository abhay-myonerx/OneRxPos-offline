import { describe, it, expect } from "vitest";
import { resolveMode } from "../../src/hardware/peripheral-mode";

describe("resolveMode", () => {
  it("per-device mode wins over the global override", () => {
    expect(resolveMode("mock", "hardware")).toBe("mock");
    expect(resolveMode("hardware", "mock")).toBe("hardware");
  });

  it("falls back to the global override when the device has none", () => {
    expect(resolveMode(undefined, "mock")).toBe("mock");
  });

  it("defaults to hardware when nothing is set", () => {
    expect(resolveMode(undefined, undefined)).toBe("hardware");
  });
});
