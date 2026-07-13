import { PaymentMethod } from "@/types/enums/status.enums";

export interface PaymentLine {
  method: PaymentMethod;
  amount: number;
}

/**
 * Total of the CARD-tender lines, in cents — the amount to collect on the
 * payment terminal. Non-card tenders (cash, gift, etc.) are excluded.
 */
export function cardAmountCents(payments: PaymentLine[]): number {
  const dollars = payments
    .filter((p) => p.method === PaymentMethod.CARD)
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  return Math.round(dollars * 100);
}
