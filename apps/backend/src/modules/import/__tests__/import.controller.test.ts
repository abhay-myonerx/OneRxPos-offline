import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../import.service", () => ({
  planImport: vi.fn(async () => ({ summary: { create: 1, update: 0, skip: 0, error: 0 }, rows: [] })),
  commitImport: vi.fn(async () => ({ summary: { create: 1, update: 0, skip: 0, error: 0 }, rows: [], committed: true })),
}));

import { importCatalog } from "../import.controller";
import { planImport, commitImport } from "../import.service";

function res() {
  const r: any = {};
  r.status = vi.fn(() => r);
  r.json = vi.fn(() => r);
  return r;
}
beforeEach(() => vi.clearAllMocks());

describe("POST /import/catalog", () => {
  it("dryRun → planImport", async () => {
    const req: any = { db: {}, tenantId: "t1", body: { mode: "PRODUCTS", rows: [{ name: "A", sku: "S" }], dryRun: true } };
    const r = res();
    await importCatalog(req, r, vi.fn());
    expect(planImport).toHaveBeenCalled();
    expect(commitImport).not.toHaveBeenCalled();
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
  it("commit → commitImport", async () => {
    const req: any = { db: {}, tenantId: "t1", body: { mode: "PRODUCTS", rows: [{ name: "A", sku: "S" }], dryRun: false } };
    await importCatalog(req, res(), vi.fn());
    expect(commitImport).toHaveBeenCalled();
  });
  it("bad body → next(error)", async () => {
    const req: any = { db: {}, tenantId: "t1", body: { mode: "NOPE", rows: [] } };
    const next = vi.fn();
    await importCatalog(req, res(), next);
    expect(next).toHaveBeenCalled();
  });
});
