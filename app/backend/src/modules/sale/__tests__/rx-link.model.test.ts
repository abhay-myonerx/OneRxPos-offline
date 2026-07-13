// Phase 2.2 — static sanity checks for the PII-free `RxLink` model, mirroring
// `drug-product.model.test.ts`. Shape assertions are type-level (checked by
// `tsc`) plus a runtime check against the generated scalar-field enum.

import { describe, it, expect, expectTypeOf } from "vitest";
import { Prisma } from "../../../generated/prisma/client";
import type { RxLink } from "../../../generated/prisma/client";

describe("RxLink schema", () => {
  it("exposes the Rx-at-till columns", () => {
    expectTypeOf<RxLink>().toHaveProperty("id");
    expectTypeOf<RxLink>().toHaveProperty("tenantId");
    expectTypeOf<RxLink>().toHaveProperty("saleId");
    expectTypeOf<RxLink>().toHaveProperty("saleItemId");
    expectTypeOf<RxLink>().toHaveProperty("productId");
    expectTypeOf<RxLink>().toHaveProperty("din");
    expectTypeOf<RxLink>().toHaveProperty("rxNumber");
    expectTypeOf<RxLink>().toHaveProperty("copay");
    expectTypeOf<RxLink>().toHaveProperty("consultAck");
    expectTypeOf<RxLink>().toHaveProperty("createdAt");
  });

  it("is registered in the generated scalar field enum (runtime)", () => {
    const fields = Object.values(Prisma.RxLinkScalarFieldEnum);
    expect(fields).toEqual(
      expect.arrayContaining([
        "id",
        "tenantId",
        "saleId",
        "saleItemId",
        "productId",
        "din",
        "rxNumber",
        "copay",
        "consultAck",
        "createdAt",
      ]),
    );
  });

  it("is PII-FREE — carries NO patient or prescriber columns", () => {
    const fields = Object.values(Prisma.RxLinkScalarFieldEnum) as string[];
    for (const forbidden of [
      "patientName",
      "patientId",
      "prescriber",
      "prescriberName",
      "prescriberId",
      "patient",
      "dob",
    ]) {
      expect(fields).not.toContain(forbidden);
    }
  });

  it("is tenant-scoped (has tenantId) for DIRECT_TENANT_MODELS coverage", () => {
    const fields = Object.values(Prisma.RxLinkScalarFieldEnum) as string[];
    expect(fields).toContain("tenantId");
  });
});
