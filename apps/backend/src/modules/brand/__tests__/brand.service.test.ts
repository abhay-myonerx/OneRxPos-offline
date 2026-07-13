// Service-level coverage for the Catalog Brand module.
// Mocks both the Prisma delegate and the audit-log helper. Tenant
// isolation is enforced at the Prisma extension layer + testcontainers
// canary — not duplicated here per BACKEND_MODULE_PATTERN.md §11.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../modules/audit/audit.service", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

import * as service from "../brand.service";
import { slugify } from "../brand.validation";
import { writeAuditLog } from "../../../modules/audit/audit.service";

const writeMock = writeAuditLog as unknown as ReturnType<typeof vi.fn>;

interface BrandRow {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string | null;
  logo: string | null;
  website: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function makeBrand(overrides: Partial<BrandRow> = {}): BrandRow {
  return {
    id: "brand-1",
    tenantId: "tenant-1",
    name: "Acme",
    slug: "acme",
    description: null,
    logo: null,
    website: null,
    isActive: true,
    createdAt: new Date("2026-05-22T00:00:00Z"),
    updatedAt: new Date("2026-05-22T00:00:00Z"),
    ...overrides,
  };
}

function makeDb(impl: Partial<Record<string, ReturnType<typeof vi.fn>>> = {}): any {
  return {
    brand: {
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

describe("brand.validation.slugify", () => {
  it("normalises to lowercase ASCII hyphenated form", () => {
    expect(slugify("Hello World")).toBe("hello-world");
    expect(slugify("  --foo--bar  ")).toBe("foo-bar");
    expect(slugify("Café Niño")).toBe("cafe-nino");
  });

  it("collapses non-alphanumerics and trims hyphens", () => {
    expect(slugify("A&B / C*D")).toBe("a-b-c-d");
    expect(slugify("--leading-and-trailing--")).toBe("leading-and-trailing");
  });
});

describe("brand.service.list", () => {
  it("returns paginated active brands by default", async () => {
    const db = makeDb({
      findMany: vi.fn().mockResolvedValue([makeBrand()]),
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
    const args = db.brand.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ isActive: true });
  });

  it("applies search OR over name and slug", async () => {
    const db = makeDb({
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    });
    await service.list(db, {
      page: 1,
      limit: 20,
      sortBy: "name",
      sortOrder: "asc",
      search: "acme",
    } as never);
    const args = db.brand.findMany.mock.calls[0][0];
    expect(args.where.OR).toEqual([
      { name: { contains: "acme", mode: "insensitive" } },
      { slug: { contains: "acme", mode: "insensitive" } },
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
    const args = db.brand.findMany.mock.calls[0][0];
    expect(args.where.isActive).toBeUndefined();
  });
});

describe("brand.service.getById", () => {
  it("returns the row with product count", async () => {
    const db = makeDb({
      findUnique: vi.fn().mockResolvedValue({ ...makeBrand(), _count: { products: 5 } }),
    });
    const row = await service.getById(db, "brand-1");
    expect(row).toMatchObject({ id: "brand-1" });
  });

  it("throws NotFoundError when missing", async () => {
    const db = makeDb({ findUnique: vi.fn().mockResolvedValue(null) });
    await expect(service.getById(db, "missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("brand.service.create", () => {
  it("derives slug from name when slug omitted and writes audit", async () => {
    const brand = makeBrand({ slug: "acme" });
    const db = makeDb({
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(brand),
    });
    const row = await service.create(db, actor, { name: "Acme" });
    expect(row).toEqual(brand);
    expect(db.brand.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: actor.tenantId,
        name: "Acme",
        slug: "acme",
      }),
    });
    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "BRAND_CREATED",
        entityType: "Brand",
        entityId: brand.id,
        tenantId: actor.tenantId,
        userId: actor.id,
      }),
    );
  });

  it("auto-numbers slug when derived slug collides", async () => {
    const brand = makeBrand({ slug: "acme-2" });
    const db = makeDb({
      findFirst: vi.fn().mockResolvedValueOnce({ id: "brand-other" }).mockResolvedValueOnce(null),
      create: vi.fn().mockResolvedValue(brand),
    });
    const row = await service.create(db, actor, { name: "Acme" });
    expect(row.slug).toBe("acme-2");
    expect(db.brand.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ slug: "acme-2" }),
    });
  });

  it("rejects an explicit duplicate slug with ConflictError", async () => {
    const db = makeDb({
      findFirst: vi.fn().mockResolvedValue({ id: "brand-other" }),
    });
    await expect(service.create(db, actor, { name: "Acme", slug: "acme" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("normalises an explicit slug before storage", async () => {
    const brand = makeBrand({ slug: "cool-co" });
    const db = makeDb({
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(brand),
    });
    await service.create(db, actor, { name: "Cool Co", slug: "cool-co" });
    expect(db.brand.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ slug: "cool-co" }),
    });
  });
});

describe("brand.service.update", () => {
  it("applies partial updates and writes audit", async () => {
    const before = makeBrand();
    const after = { ...before, name: "Acme Co" };
    const db = makeDb({
      findUnique: vi.fn().mockResolvedValue(before),
      update: vi.fn().mockResolvedValue(after),
    });
    const row = await service.update(db, actor, before.id, {
      name: "Acme Co",
    });
    expect(row).toEqual(after);
    expect(writeMock).toHaveBeenCalledWith(expect.objectContaining({ action: "BRAND_UPDATED" }));
  });

  it("rejects changing slug to one already taken", async () => {
    const before = makeBrand({ slug: "acme" });
    const db = makeDb({
      findUnique: vi.fn().mockResolvedValue(before),
      findFirst: vi.fn().mockResolvedValue({ id: "brand-other" }),
    });
    await expect(service.update(db, actor, before.id, { slug: "taken" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("skips slug uniqueness check when slug is unchanged", async () => {
    const before = makeBrand({ slug: "acme" });
    const after = { ...before, description: "New desc" };
    const findFirst = vi.fn();
    const db = makeDb({
      findUnique: vi.fn().mockResolvedValue(before),
      findFirst,
      update: vi.fn().mockResolvedValue(after),
    });
    await service.update(db, actor, before.id, {
      slug: "acme",
      description: "New desc",
    });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("throws 404 when target missing", async () => {
    const db = makeDb({ findUnique: vi.fn().mockResolvedValue(null) });
    await expect(service.update(db, actor, "missing", { name: "x" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("brand.service.deactivate", () => {
  it("soft-deletes when no active products reference it", async () => {
    const before = { ...makeBrand(), _count: { products: 0 } };
    const after = { ...makeBrand(), isActive: false };
    const db = makeDb({
      findUnique: vi.fn().mockResolvedValue(before),
      update: vi.fn().mockResolvedValue(after),
    });
    const row = await service.deactivate(db, actor, before.id);
    expect((row as BrandRow).isActive).toBe(false);
    expect(db.brand.update).toHaveBeenCalledWith({
      where: { id: before.id },
      data: { isActive: false },
    });
    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "BRAND_DEACTIVATED" }),
    );
  });

  it("refuses to deactivate when active products still reference it", async () => {
    const before = { ...makeBrand(), _count: { products: 3 } };
    const db = makeDb({
      findUnique: vi.fn().mockResolvedValue(before),
    });
    await expect(service.deactivate(db, actor, before.id)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("is idempotent on an already-inactive brand (no audit on no-op)", async () => {
    const before = {
      ...makeBrand({ isActive: false }),
      _count: { products: 0 },
    };
    const db = makeDb({ findUnique: vi.fn().mockResolvedValue(before) });
    const row = await service.deactivate(db, actor, before.id);
    expect((row as BrandRow).isActive).toBe(false);
    expect(writeMock).not.toHaveBeenCalled();
  });
});

describe("brand.service.restore", () => {
  it("reactivates an archived brand", async () => {
    const before = makeBrand({ isActive: false });
    const after = makeBrand({ isActive: true });
    const db = makeDb({
      findUnique: vi.fn().mockResolvedValue(before),
      update: vi.fn().mockResolvedValue(after),
    });
    const row = await service.restore(db, actor, before.id);
    expect((row as BrandRow).isActive).toBe(true);
    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "BRAND_REACTIVATED" }),
    );
  });

  it("is a no-op on an active brand (no audit)", async () => {
    const before = makeBrand({ isActive: true });
    const db = makeDb({ findUnique: vi.fn().mockResolvedValue(before) });
    const row = await service.restore(db, actor, before.id);
    expect(row).toEqual(before);
    expect(writeMock).not.toHaveBeenCalled();
  });

  it("throws 404 when brand missing", async () => {
    const db = makeDb({ findUnique: vi.fn().mockResolvedValue(null) });
    await expect(service.restore(db, actor, "missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
