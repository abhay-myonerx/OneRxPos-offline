import { z } from "zod";

export const testSendSchema = z.object({
  to: z.string().email(),
});
export type TestSendInput = z.infer<typeof testSendSchema>;

export const logListSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  status: z.enum(["QUEUED", "SENT", "FAILED", "SKIPPED"]).optional(),
  kind: z.enum(["RECEIPT", "AR_STATEMENT", "PURCHASE_ORDER", "TEST"]).optional(),
});
export type LogListInput = z.infer<typeof logListSchema>;

export const idParamSchema = z.object({
  id: z.string().uuid(),
});
