import { describe, it, expect } from "vitest";
import { PrismaClient } from "../../../generated/prisma/client";
import { PromotionType } from "../../../generated/prisma/enums";

describe("Promotion schema", () => {
  it("exposes the promotion + promotionRedemption delegates", () => {
    const c = new PrismaClient();
    expect(typeof c.promotion.findMany).toBe("function");
    expect(typeof c.promotionRedemption.findMany).toBe("function");
  });
  it("defines the PromotionType enum", () => {
    expect(PromotionType.BOGO).toBe("BOGO");
    expect(PromotionType.COUPON).toBe("COUPON");
    expect(PromotionType.VOLUME_TIER).toBe("VOLUME_TIER");
  });
});
