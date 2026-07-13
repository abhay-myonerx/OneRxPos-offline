// Tenant-isolation guard tests for the Prisma `$extends` scoping layer
// (`createTenantClient`). These run without a database — they verify the
// argument-injection logic and, critically, that EVERY tenant-owned model in
// the Prisma schema is covered by one of the two scoping layers.
//
// See docs/v2/TENANT_ISOLATION_AUDIT.md.

import { readFileSync } from "fs";
import { join } from "path";

import { describe, it, expect } from "vitest";

import {
  DIRECT_TENANT_MODELS,
  CHILD_MODEL_PARENT_RELATION,
  scopeDirect,
  scopeViaParent,
} from "../database";

const TENANT = "tenant-A";
const OTHER = "tenant-EVIL";

// Models that legitimately carry `tenant_id` but are intentionally NOT scoped
// through the per-tenant request client (documented in the audit).
const SCOPING_EXCEPTIONS = new Set<string>([
  "MigrationAuditV1ToV2", // migration-only, nullable tenant_id, raw client only
  "EnrolledDevice", // pos-auth infra (Phase 1.1); queried directly by pos-auth
  // services with an explicit tenantId filter, never via createTenantClient.
]);

function tenantOwnedModelsFromSchema(): string[] {
  const schema = readFileSync(join(__dirname, "../../../prisma/schema.prisma"), "utf8");
  const lines = schema.split("\n");
  const owned: string[] = [];
  let current: string | null = null;
  for (const line of lines) {
    const m = /^model\s+(\w+)\s*\{/.exec(line);
    if (m) {
      current = m[1];
      continue;
    }
    if (line.trim() === "}") current = null;
    else if (current && /^\s*tenantId\s+String/.test(line)) {
      owned.push(current);
    }
  }
  return owned;
}

describe("tenant-scope: schema coverage guard", () => {
  it("every model with a tenantId column is scoped (direct or via parent)", () => {
    const owned = tenantOwnedModelsFromSchema();
    expect(owned.length).toBeGreaterThan(20); // sanity: schema parsed

    const uncovered = owned.filter(
      (m) =>
        !DIRECT_TENANT_MODELS.has(m) &&
        !(m in CHILD_MODEL_PARENT_RELATION) &&
        !SCOPING_EXCEPTIONS.has(m),
    );

    // If this fails, a tenant-owned model was added without registering it
    // for tenant scoping → cross-tenant leak. Add it to DIRECT_TENANT_MODELS
    // (has tenantId) or CHILD_MODEL_PARENT_RELATION (scoped via a parent).
    expect(uncovered).toEqual([]);
  });
});

describe("tenant-scope: direct model injection", () => {
  it("read filters by tenantId (cross-tenant read blocked)", () => {
    const out = scopeDirect(TENANT, "findMany", { where: { isActive: true } });
    expect((out.where as Record<string, unknown>).tenantId).toBe(TENANT);
  });

  it("findUnique by id gains a tenant filter (cross-tenant read blocked)", () => {
    const out = scopeDirect(TENANT, "findUnique", { where: { id: "x" } });
    expect(out.where).toEqual({ id: "x", tenantId: TENANT });
  });

  it("update/delete filter by tenantId (cross-tenant mutate blocked)", () => {
    for (const op of ["update", "updateMany", "delete", "deleteMany"]) {
      const out = scopeDirect(TENANT, op, { where: { id: "x" } });
      expect((out.where as Record<string, unknown>).tenantId).toBe(TENANT);
    }
  });

  it("create injects tenantId from context", () => {
    const out = scopeDirect(TENANT, "create", { data: { name: "n" } });
    expect((out.data as Record<string, unknown>).tenantId).toBe(TENANT);
  });

  it("createMany injects tenantId into every row", () => {
    const out = scopeDirect(TENANT, "createMany", {
      data: [{ name: "a" }, { name: "b" }],
    });
    for (const row of out.data as Record<string, unknown>[]) {
      expect(row.tenantId).toBe(TENANT);
    }
  });

  it("OVERRIDES a caller-supplied tenantId (no spoofing via body/query)", () => {
    const read = scopeDirect(TENANT, "findMany", {
      where: { tenantId: OTHER },
    });
    expect((read.where as Record<string, unknown>).tenantId).toBe(TENANT);

    const create = scopeDirect(TENANT, "create", {
      data: { name: "n", tenantId: OTHER },
    });
    expect((create.data as Record<string, unknown>).tenantId).toBe(TENANT);
  });

  it("role assignment on User is tenant-scoped (cross-tenant role change blocked)", () => {
    // Simulates db.user.update({ where: { id }, data: { role } }).
    const out = scopeDirect(TENANT, "update", {
      where: { id: "other-tenant-user" },
      data: { role: "ADMIN" },
    });
    expect((out.where as Record<string, unknown>).tenantId).toBe(TENANT);
  });

  it("does not mutate the caller's args object", () => {
    const args = { where: { id: "x" } };
    scopeDirect(TENANT, "findFirst", args);
    expect(args).toEqual({ where: { id: "x" } });
  });
});

describe("tenant-scope: child model via parent relation", () => {
  it("read injects a parent-relation tenant filter", () => {
    const out = scopeViaParent(TENANT, "product", "findMany", {
      where: { sku: "abc" },
    });
    expect(out.where).toEqual({
      sku: "abc",
      product: { tenantId: TENANT },
    });
  });

  it("update/delete inject the parent-relation tenant filter", () => {
    const out = scopeViaParent(TENANT, "sale", "deleteMany", {
      where: { id: "x" },
    });
    expect((out.where as Record<string, unknown>).sale).toEqual({
      tenantId: TENANT,
    });
  });

  it("create passes through (child inherits tenancy via FK to scoped parent)", () => {
    const args = { data: { productId: "p", qty: 1 } };
    const out = scopeViaParent(TENANT, "product", "create", args);
    expect(out).toEqual(args);
  });
});
