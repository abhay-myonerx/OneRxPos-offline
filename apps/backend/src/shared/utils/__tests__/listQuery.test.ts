import { describe, it, expect } from "vitest";
import { z } from "zod";

import { createListQuerySchema, buildPrismaListQuery, formatListResponse } from "../listQuery";

describe("createListQuerySchema", () => {
  const schema = createListQuerySchema({
    sortable: ["createdAt", "email", "lastName"] as const,
    defaultSortBy: "createdAt",
    filters: z.object({
      role: z.string().optional(),
      isActive: z.coerce.boolean().optional(),
    }),
  });

  it("applies defaults when query is empty", () => {
    expect(schema.parse({})).toEqual({
      page: 1,
      limit: 20,
      sortBy: "createdAt",
      sortOrder: "desc",
    });
  });

  it("accepts sortBy values from the whitelist", () => {
    const parsed = schema.parse({ sortBy: "lastName", sortOrder: "asc" });
    expect(parsed.sortBy).toBe("lastName");
    expect(parsed.sortOrder).toBe("asc");
  });

  it("rejects sortBy values outside the whitelist", () => {
    expect(() => schema.parse({ sortBy: "passwordHash" })).toThrow();
  });

  it("rejects limit above 100 by default", () => {
    expect(() => schema.parse({ limit: 500 })).toThrow();
  });

  it("honours maxLimit override", () => {
    const big = createListQuerySchema({
      sortable: ["createdAt"] as const,
      maxLimit: 500,
    });
    expect(big.parse({ limit: 500 }).limit).toBe(500);
  });

  it("coerces numeric strings and merges filters", () => {
    const parsed = schema.parse({
      page: "3",
      limit: "10",
      role: "ADMIN",
      isActive: "true",
    });
    expect(parsed).toMatchObject({
      page: 3,
      limit: 10,
      role: "ADMIN",
      isActive: true,
    });
  });

  it("accepts and trims search", () => {
    const parsed = schema.parse({ search: "  hello  " });
    expect(parsed.search).toBe("hello");
  });

  it("treats empty search as missing", () => {
    // min(1) after trim — empty/whitespace fails.
    expect(() => schema.parse({ search: "   " })).toThrow();
  });

  it("rejects defaultSortBy not in sortable list", () => {
    expect(() =>
      createListQuerySchema({
        sortable: ["createdAt"] as const,
        defaultSortBy: "name",
      }),
    ).toThrow(/must be in sortable list/);
  });
});

describe("buildPrismaListQuery", () => {
  const baseParams = {
    page: 2,
    limit: 10,
    sortBy: "createdAt",
    sortOrder: "desc" as const,
  };

  it("computes skip/take/orderBy", () => {
    const out = buildPrismaListQuery(baseParams);
    expect(out.skip).toBe(10);
    expect(out.take).toBe(10);
    expect(out.orderBy).toEqual({ createdAt: "desc" });
  });

  it("merges extraWhere into where", () => {
    const out = buildPrismaListQuery(baseParams, {
      extraWhere: { tenantId: "t-1" },
    });
    expect(out.where).toEqual({ tenantId: "t-1" });
  });

  it("expands search across whitelisted fields", () => {
    const out = buildPrismaListQuery(
      { ...baseParams, search: "alice" },
      { searchableFields: ["firstName", "email"] },
    );
    expect(out.where.OR).toEqual([
      { firstName: { contains: "alice", mode: "insensitive" } },
      { email: { contains: "alice", mode: "insensitive" } },
    ]);
  });

  it("treats unknown params as where filters", () => {
    const out = buildPrismaListQuery({
      ...baseParams,
      role: "ADMIN",
      storeId: "s-1",
    } as never);
    expect(out.where).toMatchObject({ role: "ADMIN", storeId: "s-1" });
  });

  it("drops empty/undefined/null filter values", () => {
    const out = buildPrismaListQuery({
      ...baseParams,
      role: "",
      storeId: undefined,
      note: null,
    } as never);
    expect(out.where).toEqual({});
  });

  it("applies filterMap overrides", () => {
    const out = buildPrismaListQuery({ ...baseParams, createdFrom: "2026-01-01" } as never, {
      filterMap: {
        createdFrom: (v) => ({ createdAt: { gte: new Date(v as string) } }),
      },
    });
    expect(out.where.createdAt).toEqual({ gte: new Date("2026-01-01") });
  });

  it("preserves caller-supplied OR by AND-merging with search OR", () => {
    const out = buildPrismaListQuery(
      { ...baseParams, search: "x" },
      {
        searchableFields: ["name"],
        extraWhere: { OR: [{ a: 1 }, { b: 2 }] },
      },
    );
    expect(out.where.OR).toBeUndefined();
    expect(out.where.AND).toEqual([
      { OR: [{ a: 1 }, { b: 2 }] },
      { OR: [{ name: { contains: "x", mode: "insensitive" } }] },
    ]);
  });

  it("returns meta suitable for formatListResponse", () => {
    const out = buildPrismaListQuery(baseParams);
    expect(out.meta).toEqual(baseParams);
    const formatted = formatListResponse([{ id: "x" }], 21, out.meta);
    expect(formatted.pagination).toEqual({
      page: 2,
      limit: 10,
      total: 21,
      totalPages: 3,
      hasMore: true,
    });
  });
});
