import { z } from "zod";

export const purchaseSchema = z.object({ amountCents: z.number().int().positive() });
export const refundSchema = z.object({
  amountCents: z.number().int().positive(),
  originalTxnId: z.string().min(1),
});

export type PurchaseInput = z.infer<typeof purchaseSchema>;
export type RefundInput = z.infer<typeof refundSchema>;
