import { describe, it, expect } from "vitest";
import {
  priceOverrideCtx, discountOverCapCtx, voidLineCtx, voidTransactionCtx, openPriceItemCtx,
} from "../override-context";

describe("override context builders", () => {
  it("price override", () => {
    expect(priceOverrideCtx("p1", 100, 80)).toEqual({ action: "PRICE_OVERRIDE", context: "p1:100->80" });
  });
  it("discount over cap", () => {
    expect(discountOverCapCtx("percent", 25)).toEqual({ action: "DISCOUNT_OVER_CAP", context: "percent:25" });
  });
  it("void line", () => {
    expect(voidLineCtx("p1")).toEqual({ action: "VOID_LINE", context: "p1" });
  });
  it("void transaction", () => {
    expect(voidTransactionCtx(3)).toEqual({ action: "VOID_TRANSACTION", context: "count:3" });
  });
  it("open price item", () => {
    expect(openPriceItemCtx(12.5, "Repair fee")).toEqual({ action: "OPEN_PRICE_ITEM", context: "12.5:Repair fee" });
  });
});
