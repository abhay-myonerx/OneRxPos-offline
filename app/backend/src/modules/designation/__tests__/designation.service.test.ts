import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../modules/audit/audit.service", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

import * as service from "../designation.service";
import { writeAuditLog } from "../../../modules/audit/audit.service";

const writeMock = writeAuditLog as unknown as ReturnType<typeof vi.fn>;

interface Row {
  id: string;
  tenantId: string;
  title: string;
  code: string;
  level: number | null;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function makeRow(overrides: Partial<Row> = {}): Row {
  return {
    id: "des-1",
    tenantId: "tenant-1",
    title: "Cashier",
    code: "CASHIER",
    level: 1,
    description: null,
    isActive: true,
    createdAt: new Date("2026-05-20T00:00:00Z"),
    updatedAt: new Date("2026-05-20T00:00:00Z"),
    ...overrides,
  };
}

function makeDb(impl: Partial<Record<string, ReturnType<typeof vi.fn>>> = {}): any {
  return {
    designation: {
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

beforeEach(() => writeMock.mockClear());

describe("designation.service.list", () => {
  it("returns active designations by default", async () => {
    const db = makeDb({
      findMany: vi.fn().mockResolvedValue([makeRow()]),
      count: vi.fn().mockResolvedValue(1),
    });
    const out = await service.list(db, {
      page: 1,
      limit: 20,
      sortBy: "title",
      sortOrder: "asc",
    } as never);
    expect(out.pagination.total).toBe(1);
    const args = db.designation.findMany.mock.calls[0][0];
    expect(args.where.isActive).toBe(true);
  });

  it("filters by level when provided", async () => {
    const db = makeDb({
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    });
    await service.list(db, {
      page: 1,
      limit: 20,
      sortBy: "title",
      sortOrder: "asc",
      level: 3,
    } as never);
    const args = db.designation.findMany.mock.calls[0][0];
    expect(args.where.level).toBe(3);
  });
});

describe("designation.service.create", () => {
  it("creates and audits", async () => {
    const row = makeRow();
    const db = makeDb({
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(row),
    });
    const out = await service.create(db, actor, {
      title: "Cashier",
      code: "CASHIER",
      level: 1,
    });
    expect(out).toEqual(row);
    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "DESIGNATION_CREATED" }),
    );
  });

  it("rejects duplicate code", async () => {
    const db = makeDb({
      findFirst: vi.fn().mockResolvedValue(makeRow()),
    });
    await expect(service.create(db, actor, { title: "x", code: "CASHIER" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});

describe("designation.service.update", () => {
  it("updates partial fields and audits", async () => {
    const before = makeRow();
    const after = { ...before, title: "Senior Cashier" };
    const db = makeDb({
      findUnique: vi.fn().mockResolvedValue(before),
      update: vi.fn().mockResolvedValue(after),
    });
    const out = await service.update(db, actor, before.id, {
      title: "Senior Cashier",
    });
    expect(out).toEqual(after);
    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "DESIGNATION_UPDATED" }),
    );
  });
});

describe("designation.service.deactivate", () => {
  it("refuses to deactivate when referenced by active employees", async () => {
    const before = { ...makeRow(), _count: { employees: 4 } };
    const db = makeDb({
      findUnique: vi.fn().mockResolvedValue(before),
    });
    await expect(service.deactivate(db, actor, before.id)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("soft-deletes when no active employees reference it", async () => {
    const before = { ...makeRow(), _count: { employees: 0 } };
    const after = makeRow({ isActive: false });
    const db = makeDb({
      findUnique: vi.fn().mockResolvedValue(before),
      update: vi.fn().mockResolvedValue(after),
    });
    const out = await service.deactivate(db, actor, before.id);
    expect((out as Row).isActive).toBe(false);
    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "DESIGNATION_DEACTIVATED" }),
    );
  });
});

describe("designation.service.restore", () => {
  it("reactivates an archived designation", async () => {
    const before = makeRow({ isActive: false });
    const after = makeRow({ isActive: true });
    const db = makeDb({
      findUnique: vi.fn().mockResolvedValue(before),
      update: vi.fn().mockResolvedValue(after),
    });
    const out = await service.restore(db, actor, before.id);
    expect((out as Row).isActive).toBe(true);
    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "DESIGNATION_REACTIVATED" }),
    );
  });
});
