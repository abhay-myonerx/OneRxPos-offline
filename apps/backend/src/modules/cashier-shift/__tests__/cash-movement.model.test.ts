// Static sanity checks for the Phase 1.4 `CashMovement` model, mirroring
// `barcode-template.model.test.ts`. The ESM "prisma-client" generator does not
// expose `Prisma.dmmf`, so model-shape assertions are made at the type level
// (checked by `tsc`) plus one runtime check against the generated scalar-field
// enum — not by walking `Prisma.dmmf.datamodel.models`.

import { describe, it, expect, expectTypeOf } from "vitest";
import { Prisma } from "../../../generated/prisma/client";
import type { CashMovement } from "../../../generated/prisma/client";

describe("CashMovement schema", () => {
  it("CashMovement model exposes the cash-movement columns", () => {
    expectTypeOf<CashMovement>().toHaveProperty("id");
    expectTypeOf<CashMovement>().toHaveProperty("tenantId");
    expectTypeOf<CashMovement>().toHaveProperty("shiftId");
    expectTypeOf<CashMovement>().toHaveProperty("type");
    expectTypeOf<CashMovement>().toHaveProperty("amount");
    expectTypeOf<CashMovement>().toHaveProperty("reason");
    expectTypeOf<CashMovement>().toHaveProperty("userId");
    expectTypeOf<CashMovement>().toHaveProperty("createdAt");
  });

  it("CashMovement is registered in the generated client's scalar field enum (runtime)", () => {
    const fields = Object.values(Prisma.CashMovementScalarFieldEnum);
    expect(fields).toEqual(
      expect.arrayContaining([
        "id",
        "tenantId",
        "shiftId",
        "type",
        "amount",
        "reason",
        "userId",
        "createdAt",
      ]),
    );
  });

  it("CashierShift exposes the new denomination-count columns", () => {
    // Compile-time proof the new JSON columns landed on the model.
    expectTypeOf<
      import("../../../generated/prisma/client").CashierShift
    >().toHaveProperty("openingCounts");
    expectTypeOf<
      import("../../../generated/prisma/client").CashierShift
    >().toHaveProperty("closingCounts");
    const fields = Object.values(Prisma.CashierShiftScalarFieldEnum);
    expect(fields).toEqual(expect.arrayContaining(["openingCounts", "closingCounts"]));
  });
});
