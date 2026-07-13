import { describe, it, expect } from "vitest";
import { paginationSchema, buildPagination, formatPaginatedResponse } from "../pagination";

describe("paginationSchema", () => {
  it("applies defaults when query is empty", () => {
    const parsed = paginationSchema.parse({});
    expect(parsed).toEqual({
      page: 1,
      limit: 20,
      sortBy: "createdAt",
      sortOrder: "desc",
    });
  });

  it("coerces numeric strings from query params", () => {
    const parsed = paginationSchema.parse({ page: "3", limit: "50" });
    expect(parsed.page).toBe(3);
    expect(parsed.limit).toBe(50);
  });

  it("rejects limit above 100", () => {
    expect(() => paginationSchema.parse({ limit: 500 })).toThrow();
  });

  it("rejects non-positive page", () => {
    expect(() => paginationSchema.parse({ page: 0 })).toThrow();
  });
});

describe("buildPagination", () => {
  it("computes skip/take from page+limit", () => {
    const result = buildPagination({
      page: 3,
      limit: 20,
      sortBy: "name",
      sortOrder: "asc",
    });
    expect(result).toEqual({
      skip: 40,
      take: 20,
      orderBy: { name: "asc" },
    });
  });

  it("page 1 yields skip 0", () => {
    const result = buildPagination({
      page: 1,
      limit: 10,
      sortBy: "createdAt",
      sortOrder: "desc",
    });
    expect(result.skip).toBe(0);
    expect(result.take).toBe(10);
  });
});

describe("formatPaginatedResponse", () => {
  const params = {
    page: 2,
    limit: 10,
    sortBy: "createdAt",
    sortOrder: "desc" as const,
  };

  it("computes totalPages and hasMore correctly", () => {
    const out = formatPaginatedResponse([{ id: 1 }], 25, params);
    expect(out.pagination).toEqual({
      page: 2,
      limit: 10,
      total: 25,
      totalPages: 3,
      hasMore: true,
    });
    expect(out.data).toEqual([{ id: 1 }]);
  });

  it("hasMore is false on the last page", () => {
    const out = formatPaginatedResponse([], 20, params);
    expect(out.pagination.hasMore).toBe(false);
    expect(out.pagination.totalPages).toBe(2);
  });

  it("totalPages is 0 when total is 0", () => {
    const out = formatPaginatedResponse([], 0, params);
    expect(out.pagination.totalPages).toBe(0);
    expect(out.pagination.hasMore).toBe(false);
  });
});
