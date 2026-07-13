import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../inventory/inventory.service", () => ({
  getLowStockItems: vi.fn(async () => ({
    data: [
      { productId: "p1", storeId: "st1", quantity: 2, lowStockThreshold: 5, product: { id: "p1", name: "Aspirin" } },
      { productId: "p2", storeId: "st1", quantity: 0, lowStockThreshold: 3, product: { id: "p2", name: "Bandage" } },
    ],
    pagination: {},
  })),
}));
vi.mock("../../product/product-supplier.service", () => ({
  getPreferredVendor: vi.fn(async (_db: any, productId: string) =>
    productId === "p1" ? { supplierId: "s1", costPrice: 2, reorderQty: 10 } : null,
  ),
}));

import { getReorderSuggestions } from "../purchase.service";

beforeEach(() => vi.clearAllMocks());

describe("getReorderSuggestions", () => {
  it("joins low-stock products to their preferred vendor + suggested qty", async () => {
    const out = await getReorderSuggestions({} as any, "st1");
    expect(out).toHaveLength(2);
    const p1 = out.find((s) => s.productId === "p1")!;
    expect(p1.preferredVendor?.supplierId).toBe("s1");
    expect(p1.suggestedQty).toBe(10); // vendor reorderQty
    const p2 = out.find((s) => s.productId === "p2")!;
    expect(p2.preferredVendor).toBeNull();
    expect(p2.suggestedQty).toBe(3); // fallback max(threshold,1)
  });
});
