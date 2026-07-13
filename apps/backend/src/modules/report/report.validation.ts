import { z } from "zod";

export const reportQuerySchema = z.object({
  storeId: z.string().uuid().optional(),
  dateFrom: z.coerce.date(),
  dateTo: z.coerce.date(),
  groupBy: z.enum(["day", "week", "month"]).default("day"),
});

export type ReportQuery = z.infer<typeof reportQuerySchema>;

export const cashierReportSchema = z.object({
  storeId: z.string().uuid().optional(),
  cashierId: z.string().uuid().optional(),
  dateFrom: z.coerce.date(),
  dateTo: z.coerce.date(),
});

export type CashierReportQuery = z.infer<typeof cashierReportSchema>;

// 3H.6 AR aging report — invoice-date aging as of a date (default now).
export const arAgingQuerySchema = z.object({
  asOf: z.coerce.date().optional(),
  storeId: z.string().uuid().optional(),
});
export type ArAgingQuery = z.infer<typeof arAgingQuerySchema>;
