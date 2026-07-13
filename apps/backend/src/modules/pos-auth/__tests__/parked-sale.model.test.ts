// Static sanity checks for the Phase 1.3b `ParkedSale` model, mirroring
// `schema.sale-override.test.ts`. The ESM "prisma-client" generator does not
// expose `Prisma.dmmf`, so model-shape assertions are made at the type level
// (checked by `tsc`) plus one runtime check against the generated scalar-field
// enum — not by walking `Prisma.dmmf.datamodel.models`.

import { describe, it, expect, expectTypeOf } from "vitest";
import { Prisma } from "../../../generated/prisma/client";
import type { ParkedSale } from "../../../generated/prisma/client";

describe("ParkedSale schema", () => {
  it("ParkedSale model exposes the suspend/resume columns", () => {
    expectTypeOf<ParkedSale>().toHaveProperty("id");
    expectTypeOf<ParkedSale>().toHaveProperty("tenantId");
    expectTypeOf<ParkedSale>().toHaveProperty("storeId");
    expectTypeOf<ParkedSale>().toHaveProperty("cashierId");
    expectTypeOf<ParkedSale>().toHaveProperty("parkedByName");
    expectTypeOf<ParkedSale>().toHaveProperty("customerId");
    expectTypeOf<ParkedSale>().toHaveProperty("label");
    expectTypeOf<ParkedSale>().toHaveProperty("snapshot");
    expectTypeOf<ParkedSale>().toHaveProperty("itemCount");
    expectTypeOf<ParkedSale>().toHaveProperty("total");
    expectTypeOf<ParkedSale>().toHaveProperty("status");
    expectTypeOf<ParkedSale>().toHaveProperty("claimedByUserId");
    expectTypeOf<ParkedSale>().toHaveProperty("claimedAt");
    expectTypeOf<ParkedSale>().toHaveProperty("createdAt");
    expectTypeOf<ParkedSale>().toHaveProperty("updatedAt");
  });

  it("ParkedSale is registered in the generated client's scalar field enum (runtime)", () => {
    const fields = Object.values(Prisma.ParkedSaleScalarFieldEnum);
    expect(fields).toEqual(
      expect.arrayContaining([
        "id",
        "tenantId",
        "storeId",
        "cashierId",
        "snapshot",
        "itemCount",
        "total",
        "status",
        "claimedByUserId",
        "claimedAt",
      ]),
    );
  });
});
