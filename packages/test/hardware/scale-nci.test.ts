import { describe, it, expect } from "vitest";
import { parseScaleWeight } from "../../src/hardware/scale-nci";

describe("parseScaleWeight", () => {
  it("parses a stable kilogram reading", () => {
    expect(parseScaleWeight("  1.245kg S\r")).toEqual({
      value: 1.245,
      unit: "kg",
      stable: true,
    });
  });

  it("parses a negative pound reading in motion", () => {
    expect(parseScaleWeight("-0.5lbM\r")).toEqual({
      value: -0.5,
      unit: "lb",
      stable: false,
    });
  });

  it("tolerates STX/ETX control bytes around the frame", () => {
    expect(parseScaleWeight("\x021.000kgS\x03")).toEqual({
      value: 1,
      unit: "kg",
      stable: true,
    });
  });

  it("parses a grams reading", () => {
    expect(parseScaleWeight("500g")).toEqual({ value: 500, unit: "g", stable: true });
  });

  it("returns null when there is no unit", () => {
    expect(parseScaleWeight("1.245\r")).toBeNull();
  });

  it("returns null for a status frame with no numeric weight", () => {
    expect(parseScaleWeight("error\r")).toBeNull();
  });

  it("returns null for an empty frame", () => {
    expect(parseScaleWeight("")).toBeNull();
  });
});
