import { describe, it, expect } from "vitest";
import { buildMiscCartLine } from "../misc-item";

describe("buildMiscCartLine", () => {
  it("builds a misc line referencing the misc product with the entered price/name/category", () => {
    const line = buildMiscCartLine({
      miscProductId: "misc-1", description: "Repair fee", price: 12.5,
      taxCategory: "STANDARD", grant: "g", authorizerUserId: "mgr", lineId: "L1",
    });
    expect(line.productId).toBe("misc-1");
    expect(line.name).toBe("Repair fee");
    expect(line.unitPrice).toBe(12.5);
    expect(line.taxCategory).toBe("STANDARD");
    expect(line.isMisc).toBe(true);
    expect(line.quantity).toBe(1);
    expect(line.levies).toEqual([]);
    expect(line.priceOverride).toEqual({ originalPrice: 0, grant: "g", authorizerUserId: "mgr" });
  });
});
