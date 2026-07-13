// Static sanity checks for the Phase 1.3a `SaleOverride` model, mirroring the
// pattern established in schema.v2-phase2.test.ts. This generator emits the
// new (ESM) "prisma-client" output, which does not expose `Prisma.dmmf` — so
// model-shape assertions are made at the type level (checked by `tsc`) plus
// one runtime check against the generated scalar-field-name enum, instead of
// walking `Prisma.dmmf.datamodel.models` (classic `prisma-client-js` API).

import { describe, it, expect, expectTypeOf } from "vitest";
import { Prisma } from "../../../generated/prisma/client";
import type { SaleOverride } from "../../../generated/prisma/client";

describe("SaleOverride schema", () => {
  it("SaleOverride model exposes the manager-override audit columns", () => {
    expectTypeOf<SaleOverride>().toHaveProperty("id");
    expectTypeOf<SaleOverride>().toHaveProperty("saleId");
    expectTypeOf<SaleOverride>().toHaveProperty("action");
    expectTypeOf<SaleOverride>().toHaveProperty("context");
    expectTypeOf<SaleOverride>().toHaveProperty("authorizerUserId");
    expectTypeOf<SaleOverride>().toHaveProperty("cashierId");
    expectTypeOf<SaleOverride>().toHaveProperty("createdAt");
  });

  it("SaleOverride is registered in the generated client's scalar field enum (runtime)", () => {
    const fields = Object.values(Prisma.SaleOverrideScalarFieldEnum);
    expect(fields).toEqual(
      expect.arrayContaining(["saleId", "action", "context", "authorizerUserId", "cashierId"]),
    );
  });
});
