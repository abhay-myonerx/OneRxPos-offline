// Coverage for the Miscellaneous / open-price product ensure helper. It must
// create (and heal legacy rows to) a SERVICE product so open-price / Rx lines
// are sellable without a store_stock row — checkout bypasses the stock guard
// only for productType === "SERVICE".

import { describe, it, expect, vi } from "vitest";
import { ensureMiscProduct } from "../misc-product.service";

/* eslint-disable @typescript-eslint/no-explicit-any */
function makeDb(product: Partial<Record<string, ReturnType<typeof vi.fn>>>): any {
  return {
    product: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      ...product,
    },
  };
}

describe("ensureMiscProduct", () => {
  it("creates the misc product as a SERVICE when none exists", async () => {
    const db = makeDb({
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "misc-new" }),
    });
    const id = await ensureMiscProduct(db, "tenant-1");
    expect(id).toBe("misc-new");
    expect(db.product.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sku: "__MISC__", productType: "SERVICE" }) }),
    );
  });

  it("heals a legacy STANDARD misc product to SERVICE and returns it", async () => {
    const db = makeDb({
      findFirst: vi.fn().mockResolvedValue({ id: "misc-old", productType: "STANDARD" }),
      update: vi.fn().mockResolvedValue({ id: "misc-old" }),
    });
    const id = await ensureMiscProduct(db, "tenant-1");
    expect(id).toBe("misc-old");
    expect(db.product.update).toHaveBeenCalledWith({
      where: { id: "misc-old" },
      data: { productType: "SERVICE" },
    });
    expect(db.product.create).not.toHaveBeenCalled();
  });

  it("does not update an already-SERVICE misc product (idempotent)", async () => {
    const db = makeDb({
      findFirst: vi.fn().mockResolvedValue({ id: "misc-ok", productType: "SERVICE" }),
    });
    const id = await ensureMiscProduct(db, "tenant-1");
    expect(id).toBe("misc-ok");
    expect(db.product.update).not.toHaveBeenCalled();
    expect(db.product.create).not.toHaveBeenCalled();
  });
});
