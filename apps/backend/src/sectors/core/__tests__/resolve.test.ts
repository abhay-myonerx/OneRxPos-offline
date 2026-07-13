import { describe, it, expect } from "vitest";
import { createSectorRegistry } from "../registry";
import { resolveActiveSectors } from "../resolve";
import type { SectorModule } from "../types";

const mod = (id: string): SectorModule => ({ id, label: id });

describe("resolveActiveSectors", () => {
  it("returns only enabled + registered modules, in registration order", () => {
    const r = createSectorRegistry();
    r.register(mod("a"));
    r.register(mod("b"));
    r.register(mod("c"));
    const active = resolveActiveSectors(r, { a: true, b: false, c: true });
    expect(active.map((m) => m.id)).toEqual(["a", "c"]);
  });
  it("ignores an enabled-but-unregistered slug", () => {
    const r = createSectorRegistry();
    r.register(mod("a"));
    const active = resolveActiveSectors(r, { a: true, ghost: true });
    expect(active.map((m) => m.id)).toEqual(["a"]);
  });
  it("returns none when nothing is enabled", () => {
    const r = createSectorRegistry();
    r.register(mod("a"));
    expect(resolveActiveSectors(r, { a: false })).toEqual([]);
    expect(resolveActiveSectors(r, {})).toEqual([]);
  });
});
