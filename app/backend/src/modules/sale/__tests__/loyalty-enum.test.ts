import { describe, it, expect } from "vitest";
import { PaymentMethod } from "../../../generated/prisma/enums";

describe("PaymentMethod", () => {
  it("has a LOYALTY method (redemption tender)", () => {
    expect(PaymentMethod.LOYALTY).toBe("LOYALTY");
  });
});
