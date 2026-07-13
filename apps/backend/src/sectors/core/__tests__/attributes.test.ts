import { describe, it, expect } from "vitest";
import { z } from "zod";
import { validateProductAttributes } from "../attributes";
import type { SectorModule } from "../types";

const withSchema = (id: string, schema: z.ZodTypeAny): SectorModule => ({ id, label: id, attributeSchema: schema });

describe("validateProductAttributes", () => {
  it("passes valid attributes for a sector schema", () => {
    const sample = withSchema("sample", z.object({ sampleFlag: z.boolean().optional() }));
    expect(validateProductAttributes([sample], { sampleFlag: true })).toMatchObject({ sampleFlag: true });
  });
  it("throws ValidationError naming the sector for invalid attributes", () => {
    const sample = withSchema("sample", z.object({ sampleFlag: z.boolean().optional() }));
    expect(() => validateProductAttributes([sample], { sampleFlag: "nope" })).toThrow(/sample/);
  });
  it("passes through when no active sector declares a schema", () => {
    const bare: SectorModule = { id: "bare", label: "bare" };
    expect(validateProductAttributes([bare], { anything: 1 })).toEqual({ anything: 1 });
  });
  it("validates against multiple active sectors, preserving each other's keys", () => {
    const a = withSchema("a", z.object({ aKey: z.boolean().optional() }));
    const b = withSchema("b", z.object({ bKey: z.number().optional() }));
    const out = validateProductAttributes([a, b], { aKey: true, bKey: 3 });
    expect(out).toMatchObject({ aKey: true, bKey: 3 });
  });
});
