import { describe, it, expect, vi } from "vitest";
import * as svc from "../product-supplier.service";

// A tiny in-memory stand-in for the tenant-scoped productSupplier delegate.
function makeDb(seed: any[] = []) {
  const store = [...seed];
  const delegate = {
    findMany: vi.fn(async ({ where }: any) => store.filter((r) => r.productId === where.productId)),
    findUnique: vi.fn(async ({ where }: any) => {
      const key = where.productId_supplierId;
      return store.find((r) => r.productId === key.productId && r.supplierId === key.supplierId) ?? null;
    }),
    create: vi.fn(async ({ data }: any) => {
      if (store.some((r) => r.productId === data.productId && r.supplierId === data.supplierId)) {
        const e: any = new Error("dup");
        e.code = "P2002";
        throw e;
      }
      const row = { id: `ps-${store.length + 1}`, createdAt: new Date(), ...data };
      store.push(row);
      return row;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const key = where.productId_supplierId;
      const r = store.find((x) => x.productId === key.productId && x.supplierId === key.supplierId);
      Object.assign(r, data);
      return r;
    }),
    updateMany: vi.fn(async ({ where, data }: any) => {
      store.filter((r) => r.productId === where.productId).forEach((r) => Object.assign(r, data));
      return { count: store.length };
    }),
    delete: vi.fn(async ({ where }: any) => {
      const key = where.productId_supplierId;
      const i = store.findIndex((r) => r.productId === key.productId && r.supplierId === key.supplierId);
      if (i >= 0) store.splice(i, 1);
    }),
  };
  const db: any = {
    _store: store,
    productSupplier: delegate,
    $transaction: vi.fn(async (fn: any) => fn(db)),
  };
  return db;
}

function row(over: any) {
  return { id: over.id, productId: "p1", isActive: true, isPreferred: false, createdAt: new Date(), ...over };
}

describe("cheapest / preferred resolution", () => {
  it("getCheapestVendor returns the min active costPrice", async () => {
    const db = makeDb([row({ id: "a", supplierId: "s1", costPrice: 5 }), row({ id: "b", supplierId: "s2", costPrice: 3 })]);
    expect((await svc.getCheapestVendor(db, "p1"))?.supplierId).toBe("s2");
  });
  it("ignores inactive vendors", async () => {
    const db = makeDb([row({ id: "a", supplierId: "s1", costPrice: 1, isActive: false }), row({ id: "b", supplierId: "s2", costPrice: 3 })]);
    expect((await svc.getCheapestVendor(db, "p1"))?.supplierId).toBe("s2");
  });
  it("getPreferredVendor prefers isPreferred else cheapest", async () => {
    const d1 = makeDb([row({ id: "a", supplierId: "s1", costPrice: 5, isPreferred: true }), row({ id: "b", supplierId: "s2", costPrice: 3 })]);
    expect((await svc.getPreferredVendor(d1, "p1"))?.supplierId).toBe("s1");
    const d2 = makeDb([row({ id: "b", supplierId: "s2", costPrice: 3 })]);
    expect((await svc.getPreferredVendor(d2, "p1"))?.supplierId).toBe("s2");
    const d3 = makeDb([]);
    expect(await svc.getPreferredVendor(d3, "p1")).toBeNull();
  });
  it("listVendors flags cheapest + preferred", async () => {
    const db = makeDb([row({ id: "a", supplierId: "s1", costPrice: 5, isPreferred: true }), row({ id: "b", supplierId: "s2", costPrice: 3 })]);
    const list = await svc.listVendors(db, "p1");
    expect(list.find((r) => r.supplierId === "s2")!.isCheapest).toBe(true);
    expect(list.find((r) => r.supplierId === "s1")!.isPreferred).toBe(true);
  });
});

describe("mutations", () => {
  it("addVendor rejects a duplicate (product, supplier) with 409", async () => {
    const db = makeDb([row({ id: "a", supplierId: "s1", costPrice: 5 })]);
    await expect(svc.addVendor(db, "p1", { supplierId: "s1", costPrice: 9 })).rejects.toMatchObject({ statusCode: 409 });
  });
  it("addVendor with isPreferred sets it and unsets others", async () => {
    const db = makeDb([row({ id: "a", supplierId: "s1", costPrice: 5, isPreferred: true })]);
    await svc.addVendor(db, "p1", { supplierId: "s2", costPrice: 3, isPreferred: true });
    const s1 = db._store.find((r: any) => r.supplierId === "s1");
    const s2 = db._store.find((r: any) => r.supplierId === "s2");
    expect(s1.isPreferred).toBe(false);
    expect(s2.isPreferred).toBe(true);
  });
  it("setPreferred enforces exactly one preferred", async () => {
    const db = makeDb([
      row({ id: "a", supplierId: "s1", costPrice: 5, isPreferred: true }),
      row({ id: "b", supplierId: "s2", costPrice: 3 }),
    ]);
    await svc.setPreferred(db, "p1", "s2");
    expect(db._store.filter((r: any) => r.isPreferred)).toHaveLength(1);
    expect(db._store.find((r: any) => r.isPreferred).supplierId).toBe("s2");
  });
  it("removeVendor 404s when the link is missing", async () => {
    const db = makeDb([]);
    await expect(svc.removeVendor(db, "p1", "nope")).rejects.toMatchObject({ statusCode: 404 });
  });
});
