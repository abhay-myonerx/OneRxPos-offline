// Service-level coverage for the HRM Department module. Mocks both the
// Prisma delegate and the audit-log helper. The tenant-isolation
// regression is enforced at the Prisma extension layer and the
// testcontainers canary — not duplicated here per
// BACKEND_MODULE_PATTERN.md §11.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../modules/audit/audit.service", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

import * as service from "../department.service";
import { writeAuditLog } from "../../../modules/audit/audit.service";

const writeMock = writeAuditLog as unknown as ReturnType<typeof vi.fn>;

interface DepartmentRow {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function makeDept(overrides: Partial<DepartmentRow> = {}): DepartmentRow {
  return {
    id: "dept-1",
    tenantId: "tenant-1",
    name: "Engineering",
    code: "ENG",
    description: null,
    isActive: true,
    createdAt: new Date("2026-05-20T00:00:00Z"),
    updatedAt: new Date("2026-05-20T00:00:00Z"),
    ...overrides,
  };
}

function makeDb(impl: Partial<Record<string, ReturnType<typeof vi.fn>>> = {}): any {
  return {
    department: {
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

describe("department.service.list", () => {
  it("returns paginated active departments by default", async () => {
    const db = makeDb({
      findMany: vi.fn().mockResolvedValue([makeDept()]),
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
    expect(db.department.findMany).toHaveBeenCalled();
    const args = db.department.findMany.mock.calls[0][0];
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
      search: "kitchen",
    } as never);
    const args = db.department.findMany.mock.calls[0][0];
    expect(args.where.OR).toEqual([
      { name: { contains: "kitchen", mode: "insensitive" } },
      { code: { contains: "kitchen", mode: "insensitive" } },
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
    const args = db.department.findMany.mock.calls[0][0];
    expect(args.where.isActive).toBeUndefined();
  });
});

describe("department.service.getById", () => {
  it("returns the row with employee count", async () => {
    const db = makeDb({
      findUnique: vi.fn().mockResolvedValue({ ...makeDept(), _count: { employees: 3 } }),
    });
    const row = await service.getById(db, "dept-1");
    expect(row).toMatchObject({ id: "dept-1" });
  });

  it("throws NotFoundError when missing", async () => {
    const db = makeDb({ findUnique: vi.fn().mockResolvedValue(null) });
    await expect(service.getById(db, "missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("department.service.create", () => {
  it("creates a department and writes an audit row", async () => {
    const dept = makeDept();
    const db = makeDb({
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(dept),
    });
    const row = await service.create(db, actor, {
      name: "Engineering",
      code: "ENG",
    });
    expect(row).toEqual(dept);
    expect(db.department.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: actor.tenantId,
        name: "Engineering",
        code: "ENG",
      }),
    });
    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "DEPARTMENT_CREATED",
        entityType: "Department",
        entityId: dept.id,
        tenantId: actor.tenantId,
        userId: actor.id,
      }),
    );
  });

  it("rejects duplicate code with ConflictError", async () => {
    const db = makeDb({
      findFirst: vi.fn().mockResolvedValue(makeDept()),
    });
    await expect(service.create(db, actor, { name: "x", code: "ENG" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});

describe("department.service.update", () => {
  it("applies partial updates and writes audit", async () => {
    const before = makeDept();
    const after = { ...before, name: "Eng2" };
    const db = makeDb({
      findUnique: vi.fn().mockResolvedValue(before),
      update: vi.fn().mockResolvedValue(after),
    });
    const row = await service.update(db, actor, before.id, {
      name: "Eng2",
    });
    expect(row).toEqual(after);
    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "DEPARTMENT_UPDATED" }),
    );
  });

  it("rejects when changing code to an existing one", async () => {
    const before = makeDept({ code: "ENG" });
    const db = makeDb({
      findUnique: vi.fn().mockResolvedValue(before),
      findFirst: vi.fn().mockResolvedValue(makeDept({ id: "other" })),
    });
    await expect(service.update(db, actor, before.id, { code: "HR" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("throws 404 when target missing", async () => {
    const db = makeDb({ findUnique: vi.fn().mockResolvedValue(null) });
    await expect(service.update(db, actor, "missing", { name: "x" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("department.service.deactivate", () => {
  it("soft-deletes when no active employees reference it", async () => {
    const before = { ...makeDept(), _count: { employees: 0 } };
    const after = { ...makeDept(), isActive: false };
    const db = makeDb({
      findUnique: vi.fn().mockResolvedValue(before),
      update: vi.fn().mockResolvedValue(after),
    });
    const row = await service.deactivate(db, actor, before.id);
    expect((row as DepartmentRow).isActive).toBe(false);
    expect(db.department.update).toHaveBeenCalledWith({
      where: { id: before.id },
      data: { isActive: false },
    });
    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "DEPARTMENT_DEACTIVATED" }),
    );
  });

  it("refuses to deactivate when employees still reference it", async () => {
    const before = { ...makeDept(), _count: { employees: 2 } };
    const db = makeDb({
      findUnique: vi.fn().mockResolvedValue(before),
    });
    await expect(service.deactivate(db, actor, before.id)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});

describe("department.service.restore", () => {
  it("reactivates an archived department", async () => {
    const before = makeDept({ isActive: false });
    const after = makeDept({ isActive: true });
    const db = makeDb({
      findUnique: vi.fn().mockResolvedValue(before),
      update: vi.fn().mockResolvedValue(after),
    });
    const row = await service.restore(db, actor, before.id);
    expect((row as DepartmentRow).isActive).toBe(true);
    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "DEPARTMENT_REACTIVATED" }),
    );
  });
});
