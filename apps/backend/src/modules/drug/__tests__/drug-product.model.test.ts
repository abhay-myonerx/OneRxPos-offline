// Static sanity checks for the Phase 2.1 `DrugProduct` model + the new `Product`
// drug columns, mirroring `cash-movement.model.test.ts`. The ESM prisma-client
// generator does not expose `Prisma.dmmf`, so shape assertions are type-level
// (checked by `tsc`) plus a runtime check against the generated scalar-field enum.

import { describe, it, expect, expectTypeOf } from "vitest";
import { Prisma } from "../../../generated/prisma/client";
import type { DrugProduct, Product } from "../../../generated/prisma/client";
import { DrugScheduleCategory } from "../../../generated/prisma/enums";

describe("DrugProduct schema", () => {
  it("DrugProduct exposes the drug-identity columns", () => {
    expectTypeOf<DrugProduct>().toHaveProperty("id");
    expectTypeOf<DrugProduct>().toHaveProperty("din");
    expectTypeOf<DrugProduct>().toHaveProperty("brandName");
    expectTypeOf<DrugProduct>().toHaveProperty("company");
    expectTypeOf<DrugProduct>().toHaveProperty("form");
    expectTypeOf<DrugProduct>().toHaveProperty("route");
    expectTypeOf<DrugProduct>().toHaveProperty("activeIngredients");
    expectTypeOf<DrugProduct>().toHaveProperty("scheduleClass");
    expectTypeOf<DrugProduct>().toHaveProperty("scheduleCategory");
    expectTypeOf<DrugProduct>().toHaveProperty("status");
    expectTypeOf<DrugProduct>().toHaveProperty("npn");
  });

  it("DrugProduct is registered in the generated scalar field enum (runtime)", () => {
    const fields = Object.values(Prisma.DrugProductScalarFieldEnum);
    expect(fields).toEqual(
      expect.arrayContaining([
        "id",
        "din",
        "brandName",
        "company",
        "form",
        "route",
        "activeIngredients",
        "scheduleClass",
        "scheduleCategory",
        "status",
        "npn",
      ]),
    );
  });

  it("DrugProduct is GLOBAL — it carries NO tenantId column", () => {
    const fields = Object.values(Prisma.DrugProductScalarFieldEnum) as string[];
    expect(fields).not.toContain("tenantId");
  });

  it("Product gained the drug soft-link + schedule override columns", () => {
    expectTypeOf<Product>().toHaveProperty("din");
    expectTypeOf<Product>().toHaveProperty("scheduleOverride");
    const fields = Object.values(Prisma.ProductScalarFieldEnum);
    expect(fields).toEqual(expect.arrayContaining(["din", "scheduleOverride"]));
  });

  it("DrugScheduleCategory enum has the four normalized categories", () => {
    expect(Object.values(DrugScheduleCategory)).toEqual(
      expect.arrayContaining(["NEEDS_RX", "NARCOTIC", "BEHIND_COUNTER", "OPEN"]),
    );
  });
});
