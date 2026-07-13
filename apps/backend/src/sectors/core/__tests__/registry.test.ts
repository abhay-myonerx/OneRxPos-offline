import { describe, it, expect } from "vitest";
import { createSectorRegistry } from "../registry";
import type { SectorModule } from "../types";

const mod = (id: string): SectorModule => ({ id, label: id });

describe("SectorRegistry", () => {
  it("registers and retrieves modules", () => {
    const r = createSectorRegistry();
    r.register(mod("a"));
    expect(r.has("a")).toBe(true);
    expect(r.get("a")?.label).toBe("a");
    expect(r.all().map((m) => m.id)).toEqual(["a"]);
  });
  it("throws on duplicate id", () => {
    const r = createSectorRegistry();
    r.register(mod("a"));
    expect(() => r.register(mod("a"))).toThrow(/already registered/i);
  });
  it("preserves registration order in all()", () => {
    const r = createSectorRegistry();
    r.register(mod("a"));
    r.register(mod("b"));
    expect(r.all().map((m) => m.id)).toEqual(["a", "b"]);
  });
  it("isolated registries do not share state", () => {
    const r1 = createSectorRegistry();
    const r2 = createSectorRegistry();
    r1.register(mod("a"));
    expect(r2.has("a")).toBe(false);
  });
  it("clear() empties the registry", () => {
    const r = createSectorRegistry();
    r.register(mod("a"));
    r.clear();
    expect(r.all()).toEqual([]);
  });
});
