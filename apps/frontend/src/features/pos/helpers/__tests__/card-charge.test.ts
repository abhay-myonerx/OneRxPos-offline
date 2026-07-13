import { describe, it, expect } from "vitest";
import { cardAmountCents } from "../card-charge";
import { PaymentMethod } from "@/types/enums/status.enums";

describe("cardAmountCents", () => {
  it("sums CARD tenders to cents", () => {
    expect(cardAmountCents([{ method: PaymentMethod.CARD, amount: 12.34 }])).toBe(1234);
  });

  it("ignores non-card tenders (only the card portion is collected on the terminal)", () => {
    expect(
      cardAmountCents([
        { method: PaymentMethod.CASH, amount: 5 },
        { method: PaymentMethod.CARD, amount: 10 },
      ]),
    ).toBe(1000);
  });

  it("is 0 with no card tender", () => {
    expect(cardAmountCents([{ method: PaymentMethod.CASH, amount: 20 }])).toBe(0);
  });
});
