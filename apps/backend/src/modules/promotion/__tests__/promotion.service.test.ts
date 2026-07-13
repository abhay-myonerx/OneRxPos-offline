import { describe, it, expect, vi, beforeEach } from "vitest";
import * as svc from "../promotion.service";

function makeDb(seed: any[] = []) {
  const store = [...seed];
  return {
    _store: store,
    promotion: {
      create: vi.fn(async ({ data }: any) => {
        if (data.couponCode && store.some((p) => p.couponCode === data.couponCode)) {
          const e: any = new Error("dup");
          e.code = "P2002";
          throw e;
        }
        const row = { id: `p${store.length + 1}`, timesUsed: 0, ...data };
        store.push(row);
        return row;
      }),
      findMany: vi.fn(async () => store),
      findUnique: vi.fn(async ({ where }: any) => store.find((p) => p.id === where.id) ?? null),
      update: vi.fn(async ({ where, data }: any) => {
        const p = store.find((x) => x.id === where.id);
        Object.assign(p, data);
        return p;
      }),
      delete: vi.fn(async () => {}),
    },
  } as any;
}

beforeEach(() => vi.clearAllMocks());

describe("createPromotion", () => {
  it("validates the type-specific config", async () => {
    const db = makeDb();
    await expect(
      svc.createPromotion(db, { name: "bad", type: "PERCENT_OFF", config: { percent: 500 } }),
    ).rejects.toThrow();
    const ok = await svc.createPromotion(db, { name: "10%", type: "PERCENT_OFF", config: { percent: 10 } });
    expect(ok.type).toBe("PERCENT_OFF");
  });

  it("requires a couponCode for COUPON and rejects duplicates", async () => {
    const db = makeDb();
    await expect(
      svc.createPromotion(db, { name: "c", type: "COUPON", config: { mode: "percent", value: 10 } }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await svc.createPromotion(db, { name: "c", type: "COUPON", config: { mode: "percent", value: 10 }, couponCode: "SAVE" });
    await expect(
      svc.createPromotion(db, { name: "c2", type: "COUPON", config: { mode: "percent", value: 5 }, couponCode: "SAVE" }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("strips a couponCode from non-coupon promos", async () => {
    const db = makeDb();
    const p = await svc.createPromotion(db, { name: "x", type: "PERCENT_OFF", config: { percent: 10 }, couponCode: "NOPE" });
    expect(p.couponCode).toBeNull();
  });

  it("validates BOGO/BUNDLE/VOLUME_TIER configs", async () => {
    const db = makeDb();
    const uuid = "11111111-1111-1111-1111-111111111111";
    await expect(svc.createPromotion(db, { name: "b", type: "BUNDLE", config: { productIds: [uuid], bundlePrice: 5 } })).rejects.toThrow(); // needs ≥2
    const ok = await svc.createPromotion(db, {
      name: "v", type: "VOLUME_TIER", config: { tiers: [{ minQty: 5, percent: 10 }] },
    });
    expect(ok.type).toBe("VOLUME_TIER");
  });
});

describe("update / setActive / remove", () => {
  it("setActive flips isActive; remove 404s when missing", async () => {
    const db = makeDb([{ id: "p1", type: "PERCENT_OFF", config: { percent: 10 }, isActive: true, couponCode: null }]);
    const off = await svc.setActive(db, "p1", false);
    expect(off.isActive).toBe(false);
    await expect(svc.removePromotion(db, "nope")).rejects.toMatchObject({ statusCode: 404 });
  });
});
