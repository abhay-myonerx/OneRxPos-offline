// Static sanity checks for the v2 Phase 2 platform-level schema deltas.
// Verifies the generated Prisma client surface exposes the three additive
// deliverables from PRISMA_SCHEMA_CHANGE_PLAN.md §8.1 without requiring a
// database.
//
// Full DB-level tenant-isolation canary lives behind OI-006 (testcontainers).

import { describe, expect, expectTypeOf, it } from "vitest";

import { Role } from "@/generated/prisma/enums";
import type { MigrationAuditV1ToV2, User } from "@/generated/prisma/client";

describe("v2 Phase 2 — Role enum append", () => {
  it("keeps every v1 Role value in its original ordinal position", () => {
    const values = Object.values(Role);
    expect(values.slice(0, 4)).toEqual(["SUPER_ADMIN", "ADMIN", "MANAGER", "CASHIER"]);
  });

  it("appends HR_MANAGER, ACCOUNTANT, EMPLOYEE at the end", () => {
    const values = Object.values(Role);
    expect(values).toContain("HR_MANAGER");
    expect(values).toContain("ACCOUNTANT");
    expect(values).toContain("EMPLOYEE");
    expect(values.length).toBe(7);
  });

  it("preserves the v1 order (no reordering)", () => {
    const values = Object.values(Role);
    expect(values).toEqual([
      "SUPER_ADMIN",
      "ADMIN",
      "MANAGER",
      "CASHIER",
      "HR_MANAGER",
      "ACCOUNTANT",
      "EMPLOYEE",
    ]);
  });
});

describe("v2 Phase 2 — MigrationAuditV1ToV2 model", () => {
  it("exposes a typed MigrationAuditV1ToV2 row with audit columns", () => {
    // Compile-time assertion: the generated Prisma row type carries
    // every column declared in PRISMA_SCHEMA_CHANGE_PLAN.md §2.15.
    expectTypeOf<MigrationAuditV1ToV2>().toHaveProperty("id");
    expectTypeOf<MigrationAuditV1ToV2>().toHaveProperty("migratedAt");
    expectTypeOf<MigrationAuditV1ToV2>().toHaveProperty("phase");
    expectTypeOf<MigrationAuditV1ToV2>().toHaveProperty("tenantId");
    expectTypeOf<MigrationAuditV1ToV2>().toHaveProperty("operation");
    expectTypeOf<MigrationAuditV1ToV2>().toHaveProperty("sourceTable");
    expectTypeOf<MigrationAuditV1ToV2>().toHaveProperty("sourceRowId");
    expectTypeOf<MigrationAuditV1ToV2>().toHaveProperty("targetTable");
    expectTypeOf<MigrationAuditV1ToV2>().toHaveProperty("targetRowId");
    expectTypeOf<MigrationAuditV1ToV2>().toHaveProperty("beforeValue");
    expectTypeOf<MigrationAuditV1ToV2>().toHaveProperty("afterValue");
    expectTypeOf<MigrationAuditV1ToV2>().toHaveProperty("reversible");
    expectTypeOf<MigrationAuditV1ToV2>().toHaveProperty("actorUserId");
    expectTypeOf<MigrationAuditV1ToV2>().toHaveProperty("status");
    expectTypeOf<MigrationAuditV1ToV2>().toHaveProperty("rolledBackAt");
  });

  it("makes tenantId nullable (platform-level entries permitted)", () => {
    expectTypeOf<MigrationAuditV1ToV2["tenantId"]>().toEqualTypeOf<string | null>();
  });

  it("makes reversible non-nullable with a default", () => {
    expectTypeOf<MigrationAuditV1ToV2["reversible"]>().toEqualTypeOf<boolean>();
  });
});

describe("v2 Phase 2 — User.employeeId additive column", () => {
  it("adds nullable employeeId to the User row type", () => {
    expectTypeOf<User>().toHaveProperty("employeeId");
    expectTypeOf<User["employeeId"]>().toEqualTypeOf<string | null>();
  });

  it("leaves the existing v1 User columns intact", () => {
    // Spot-check the columns that v1 controllers depend on. Any drop or
    // rename would break the build here.
    expectTypeOf<User>().toHaveProperty("id");
    expectTypeOf<User>().toHaveProperty("tenantId");
    expectTypeOf<User>().toHaveProperty("storeId");
    expectTypeOf<User>().toHaveProperty("email");
    expectTypeOf<User>().toHaveProperty("passwordHash");
    expectTypeOf<User>().toHaveProperty("firstName");
    expectTypeOf<User>().toHaveProperty("lastName");
    expectTypeOf<User>().toHaveProperty("role");
    expectTypeOf<User>().toHaveProperty("isActive");
    expectTypeOf<User>().toHaveProperty("lastLoginAt");
    expectTypeOf<User>().toHaveProperty("createdAt");
    expectTypeOf<User>().toHaveProperty("updatedAt");
  });
});
