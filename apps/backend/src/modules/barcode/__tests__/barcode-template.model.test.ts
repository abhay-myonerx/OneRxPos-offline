// Static sanity checks for the Phase 1.3c `BarcodeTemplate` model, mirroring
// `parked-sale.model.test.ts`. The ESM "prisma-client" generator does not
// expose `Prisma.dmmf`, so model-shape assertions are made at the type level
// (checked by `tsc`) plus one runtime check against the generated scalar-field
// enum — not by walking `Prisma.dmmf.datamodel.models`.

import { describe, it, expect, expectTypeOf } from "vitest";
import { Prisma } from "../../../generated/prisma/client";
import type { BarcodeTemplate } from "../../../generated/prisma/client";

describe("BarcodeTemplate schema", () => {
  it("BarcodeTemplate model exposes the learned-label columns", () => {
    expectTypeOf<BarcodeTemplate>().toHaveProperty("id");
    expectTypeOf<BarcodeTemplate>().toHaveProperty("tenantId");
    expectTypeOf<BarcodeTemplate>().toHaveProperty("name");
    expectTypeOf<BarcodeTemplate>().toHaveProperty("matchType");
    expectTypeOf<BarcodeTemplate>().toHaveProperty("matchValue");
    expectTypeOf<BarcodeTemplate>().toHaveProperty("strategy");
    expectTypeOf<BarcodeTemplate>().toHaveProperty("config");
    expectTypeOf<BarcodeTemplate>().toHaveProperty("isActive");
    expectTypeOf<BarcodeTemplate>().toHaveProperty("createdAt");
    expectTypeOf<BarcodeTemplate>().toHaveProperty("updatedAt");
  });

  it("BarcodeTemplate is registered in the generated client's scalar field enum (runtime)", () => {
    const fields = Object.values(Prisma.BarcodeTemplateScalarFieldEnum);
    expect(fields).toEqual(
      expect.arrayContaining([
        "id",
        "tenantId",
        "name",
        "matchType",
        "matchValue",
        "strategy",
        "config",
        "isActive",
        "createdAt",
        "updatedAt",
      ]),
    );
  });
});
