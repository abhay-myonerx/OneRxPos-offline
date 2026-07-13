// Regression coverage for the ESS document-list query schema.
//
// Bug: GET /api/v2/me/documents had no `validate(..., "query")` middleware
// and used a `.passthrough()` schema, so `page`/`limit`/`sortBy`/`sortOrder`
// reached `buildPrismaListQuery` as `undefined`. Prisma then received
// `orderBy: { undefined: undefined }` / `take: undefined` and threw a
// PrismaClientValidationError, surfaced to the FE as INVALID_QUERY
// ("Invalid database query"). The schema must inject the pagination
// defaults so the built query is always valid.

import { describe, it, expect } from "vitest";

import { documentsListQuerySchema } from "../ess.validation";

describe("documentsListQuerySchema", () => {
  it("applies pagination defaults for an empty query (no INVALID_QUERY)", () => {
    const parsed = documentsListQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(20);
    expect(parsed.sortBy).toBe("createdAt");
    expect(parsed.sortOrder).toBe("desc");
  });

  it("coerces string query params and accepts the documentType filter", () => {
    const parsed = documentsListQuerySchema.parse({
      page: "2",
      limit: "5",
      sortBy: "fileName",
      sortOrder: "asc",
      documentType: "CONTRACT",
    });
    expect(parsed.page).toBe(2);
    expect(parsed.limit).toBe(5);
    expect(parsed.sortBy).toBe("fileName");
    expect(parsed.sortOrder).toBe("asc");
    expect(parsed.documentType).toBe("CONTRACT");
  });

  it("rejects a non-whitelisted sortBy (defense against sortBy injection)", () => {
    expect(() => documentsListQuerySchema.parse({ sortBy: "isConfidential" })).toThrow();
  });
});
