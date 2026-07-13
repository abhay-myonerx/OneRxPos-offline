// Service-level coverage for the Levy module (Phase 1.2 Pricing Brain).
// Mocks both the Prisma delegate and the audit-log helper. Tenant
// isolation is enforced at the Prisma extension layer + testcontainers
// canary — not duplicated here per BACKEND_MODULE_PATTERN.md §11.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../modules/audit/audit.service", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

import * as service from "../levy.service";
import { writeAuditLog } from "../../../modules/audit/audit.service";

const writeMock = writeAuditLog as unknown as ReturnType<typeof vi.fn>;

interface LevyRow {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  mode: "FLAT_PER_UNIT" | "FLAT_PER_LINE" | "PERCENT";
  amount: number;
  taxable: boolean;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  isActive: boolean;
  createdAt: Date;
}

function makeLevy(overrides: Partial<LevyRow> = {}): LevyRow {
  return {
    id: "levy-1",
    tenantId: "tenant-1",
    code: "ECO",
    name: "Eco Fee",
    mode: "FLAT_PER_UNIT",
    amount: 0.5,
    taxable: true,
    effectiveFrom: new Date("2026-01-01T00:00:00Z"),
    effectiveTo: null,
    isActive: true,
    createdAt: new Date("2026-05-20T00:00:00Z"),
    ...overrides,
  };
}

function makeDb(impl: Partial<Record<string, ReturnType<typeof vi.fn>>> = {}): any {
  return {
    levy: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      ...impl,
    },
  };
}

const actor = { id: "user-1", tenantId: "tenant-1" } as const;

beforeEach(() => {
  writeMock.mockClear();
});

describe("levy.service.list", () => {
  it("returns paginated active levies by default", async () => {
    const db = makeDb({
      findMany: vi.fn().mockResolvedValue([makeLevy()]),
      count: vi.fn().mockResolvedValue(1),
    });
    const result = await service.list(db, {
      page: 1,
      limit: 20,
      sortBy: "name",
      sortOrder: "asc",
    } as never);

    expect(result.data).toHaveLength(1);
    expect(result.pagination.total).toBe(1);
    expect(db.levy.findMany).toHaveBeenCalled();
    const args = db.levy.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ isActive: true });
  });

  it("applies search OR over name and code", async () => {
    const db = makeDb({
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    });
    await service.list(db, {
      page: 1,
      limit: 20,
      sortBy: "name",
      sortOrder: "asc",
      search: "eco",
    } as never);
    const args = db.levy.findMany.mock.calls[0][0];
    expect(args.where.OR).toEqual([
      { name: { contains: "eco", mode: "insensitive" } },
      { code: { contains: "eco", mode: "insensitive" } },
    ]);
  });

  it("archived=any drops the isActive constraint", async () => {
    const db = makeDb({
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    });
    await service.list(db, {
      page: 1,
      limit: 20,
      sortBy: "name",
      sortOrder: "asc",
      archived: "any",
    } as never);
    const args = db.levy.findMany.mock.calls[0][0];
    expect(args.where.isActive).toBeUndefined();
  });
});

describe("levy.service.getById", () => {
  it("returns the row", async () => {
    const db = makeDb({ findUnique: vi.fn().mockResolvedValue(makeLevy()) });
    const row = await service.getById(db, "levy-1");
    expect(row).toMatchObject({ id: "levy-1" });
  });

  it("throws NotFoundError when missing", async () => {
    const db = makeDb({ findUnique: vi.fn().mockResolvedValue(null) });
    await expect(service.getById(db, "missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("levy.service.create", () => {
  it("creates a levy scoped to the actor's tenant and writes an audit row", async () => {
    const levy = makeLevy();
    const db = makeDb({
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(levy),
    });
    const row = await service.create(db, actor, {
      code: "ECO",
      name: "Eco Fee",
      mode: "FLAT_PER_UNIT",
      amount: 0.5,
      taxable: true,
    });
    expect(row).toEqual(levy);
    expect(db.levy.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: actor.tenantId,
        code: "ECO",
        name: "Eco Fee",
        mode: "FLAT_PER_UNIT",
        amount: 0.5,
        taxable: true,
      }),
    });
    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "LEVY_CREATED",
        entityType: "Levy",
        entityId: levy.id,
        tenantId: actor.tenantId,
        userId: actor.id,
      }),
    );
  });

  it("rejects a duplicate [tenantId, code] with ConflictError", async () => {
    const db = makeDb({
      findFirst: vi.fn().mockResolvedValue(makeLevy()),
    });
    await expect(
      service.create(db, actor, {
        code: "ECO",
        name: "Duplicate",
        mode: "PERCENT",
        amount: 1,
        taxable: true,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.levy.create).not.toHaveBeenCalled();
  });
});

describe("levy.service.update", () => {
  it("applies partial updates and writes audit", async () => {
    const before = makeLevy();
    const after = { ...before, amount: 0.75 };
    const db = makeDb({
      findUnique: vi.fn().mockResolvedValue(before),
      update: vi.fn().mockResolvedValue(after),
    });
    const row = await service.update(db, actor, before.id, { amount: 0.75 });
    expect(row).toEqual(after);
    expect(writeMock).toHaveBeenCalledWith(expect.objectContaining({ action: "LEVY_UPDATED" }));
  });

  it("rejects when changing code to one already used within the tenant", async () => {
    const before = makeLevy({ code: "ECO" });
    const db = makeDb({
      findUnique: vi.fn().mockResolvedValue(before),
      findFirst: vi.fn().mockResolvedValue(makeLevy({ id: "other", code: "BAG" })),
    });
    await expect(service.update(db, actor, before.id, { code: "BAG" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("skips the code-uniqueness check when code is unchanged", async () => {
    const before = makeLevy({ code: "ECO" });
    const after = { ...before, name: "Eco Fee 2" };
    const findFirst = vi.fn();
    const db = makeDb({
      findUnique: vi.fn().mockResolvedValue(before),
      findFirst,
      update: vi.fn().mockResolvedValue(after),
    });
    await service.update(db, actor, before.id, { code: "ECO", name: "Eco Fee 2" });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("throws 404 when target missing", async () => {
    const db = makeDb({ findUnique: vi.fn().mockResolvedValue(null) });
    await expect(service.update(db, actor, "missing", { amount: 1 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("levy.service.deactivate", () => {
  it("soft-deletes an active levy", async () => {
    const before = makeLevy();
    const after = { ...before, isActive: false };
    const db = makeDb({
      findUnique: vi.fn().mockResolvedValue(before),
      update: vi.fn().mockResolvedValue(after),
    });
    const row = await service.deactivate(db, actor, before.id);
    expect(row).toMatchObject({ isActive: false });
    expect(db.levy.update).toHaveBeenCalledWith({
      where: { id: before.id },
      data: { isActive: false },
    });
    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "LEVY_DEACTIVATED" }),
    );
  });

  it("is idempotent on an already-inactive levy (no audit on no-op)", async () => {
    const before = makeLevy({ isActive: false });
    const db = makeDb({ findUnique: vi.fn().mockResolvedValue(before) });
    const row = await service.deactivate(db, actor, before.id);
    expect(row).toMatchObject({ isActive: false });
    expect(writeMock).not.toHaveBeenCalled();
  });

  it("throws 404 when target missing", async () => {
    const db = makeDb({ findUnique: vi.fn().mockResolvedValue(null) });
    await expect(service.deactivate(db, actor, "missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
