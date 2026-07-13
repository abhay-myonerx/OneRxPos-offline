import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { IndexedDbParkedSaleStore } from "../parked-sale-store";
import type { ParkedSaleRecord, ParkedSnapshot } from "../../types/parked-sale.types";

const snap: ParkedSnapshot = {
  items: [], customerId: null, storeId: "s1", shiftId: null, notes: "",
  storeProvince: "ON", cartDiscount: 0, cartDiscountMode: "flat", discountReauth: null,
};

const rec = (id: string): ParkedSaleRecord => ({
  id, storeId: "s1", customerId: null, label: "hold", parkedByUserId: "u1", parkedByName: "A",
  parkedAt: "2026-07-06T10:00:00Z", itemCount: 1, total: 10, snapshot: snap, origin: "local",
});

describe("IndexedDbParkedSaleStore", () => {
  beforeEach(() => {
    // Fresh in-memory IndexedDB per test.
    globalThis.indexedDB = new IDBFactory();
  });

  it("puts, gets, lists and removes parked sales", async () => {
    const store = new IndexedDbParkedSaleStore();
    await store.put(rec("a"));
    await store.put(rec("b"));
    expect((await store.list()).map((r) => r.id).sort()).toEqual(["a", "b"]);
    expect((await store.get("a"))?.label).toBe("hold");
    await store.remove("a");
    expect((await store.list()).map((r) => r.id)).toEqual(["b"]);
  });

  it("put upserts on the same id", async () => {
    const store = new IndexedDbParkedSaleStore();
    await store.put(rec("a"));
    await store.put({ ...rec("a"), label: "updated" });
    expect(await store.list()).toHaveLength(1);
    expect((await store.get("a"))?.label).toBe("updated");
  });

  it("saves, loads and clears the active-cart mirror", async () => {
    const store = new IndexedDbParkedSaleStore();
    expect(await store.loadActive()).toBeNull();
    await store.saveActive({ snapshot: snap, updatedAt: "2026-07-06T10:00:00Z" });
    expect((await store.loadActive())?.updatedAt).toBe("2026-07-06T10:00:00Z");
    await store.clearActive();
    expect(await store.loadActive()).toBeNull();
  });
});
