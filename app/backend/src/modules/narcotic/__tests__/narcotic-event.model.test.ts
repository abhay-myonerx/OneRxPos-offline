// Phase 2.4 — static sanity checks for the PII-free `NarcoticEvent` model,
// mirroring `rx-link.model.test.ts`. Shape assertions are type-level (checked by
// `tsc`) plus a runtime check against the generated scalar-field enum.

import { describe, it, expect, expectTypeOf } from "vitest";
import { Prisma } from "../../../generated/prisma/client";
import type { NarcoticEvent } from "../../../generated/prisma/client";

describe("NarcoticEvent schema", () => {
  it("exposes the narcotic-log columns", () => {
    expectTypeOf<NarcoticEvent>().toHaveProperty("id");
    expectTypeOf<NarcoticEvent>().toHaveProperty("tenantId");
    expectTypeOf<NarcoticEvent>().toHaveProperty("storeId");
    expectTypeOf<NarcoticEvent>().toHaveProperty("productId");
    expectTypeOf<NarcoticEvent>().toHaveProperty("shiftId");
    expectTypeOf<NarcoticEvent>().toHaveProperty("eventType");
    expectTypeOf<NarcoticEvent>().toHaveProperty("expectedQty");
    expectTypeOf<NarcoticEvent>().toHaveProperty("countedQty");
    expectTypeOf<NarcoticEvent>().toHaveProperty("quantityChange");
    expectTypeOf<NarcoticEvent>().toHaveProperty("discrepancy");
    expectTypeOf<NarcoticEvent>().toHaveProperty("reason");
    expectTypeOf<NarcoticEvent>().toHaveProperty("witnessUserId");
    expectTypeOf<NarcoticEvent>().toHaveProperty("createdByUserId");
    expectTypeOf<NarcoticEvent>().toHaveProperty("notes");
    expectTypeOf<NarcoticEvent>().toHaveProperty("createdAt");
  });

  it("is registered in the generated scalar field enum (runtime)", () => {
    const fields = Object.values(Prisma.NarcoticEventScalarFieldEnum);
    expect(fields).toEqual(
      expect.arrayContaining([
        "id",
        "tenantId",
        "storeId",
        "productId",
        "shiftId",
        "eventType",
        "expectedQty",
        "countedQty",
        "quantityChange",
        "discrepancy",
        "reason",
        "witnessUserId",
        "createdByUserId",
        "notes",
        "createdAt",
      ]),
    );
  });

  it("is PII-FREE — carries NO patient or prescriber columns", () => {
    const fields = Object.values(Prisma.NarcoticEventScalarFieldEnum) as string[];
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
    const fields = Object.values(Prisma.NarcoticEventScalarFieldEnum) as string[];
    expect(fields).toContain("tenantId");
  });
});
