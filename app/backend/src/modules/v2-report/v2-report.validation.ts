// Shared Zod schemas for the v2 reporting module (Phase 15 — Dashboard
// & Reports). Every report endpoint accepts a tenant-safe date range
// and an optional store/department/employee narrowing.

import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected ISO date YYYY-MM-DD")
  .transform((value) => new Date(value));

const isoDateEndOfDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected ISO date YYYY-MM-DD")
  .transform((value) => {
    const d = new Date(value);
    d.setUTCHours(23, 59, 59, 999);
    return d;
  });

const baseDateRangeShape = {
  dateFrom: isoDate.optional(),
  dateTo: isoDateEndOfDay.optional(),
  storeId: z.string().uuid().optional(),
};

function withRangeRefine<T extends z.ZodObject<z.ZodRawShape>>(schema: T) {
  return schema.refine(
    (v) => !v.dateFrom || !v.dateTo || (v.dateFrom as Date) <= (v.dateTo as Date),
    { message: "dateFrom must be on or before dateTo", path: ["dateFrom"] },
  );
}

export const dateRangeSchema = withRangeRefine(z.object(baseDateRangeShape));
export type DateRangeInput = z.infer<typeof dateRangeSchema>;

export const employeeReportSchema = z.object({
  storeId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
});
export type EmployeeReportInput = z.infer<typeof employeeReportSchema>;

export const attendanceReportSchema = withRangeRefine(
  z.object({
    ...baseDateRangeShape,
    departmentId: z.string().uuid().optional(),
    employeeId: z.string().uuid().optional(),
  }),
);
export type AttendanceReportInput = z.infer<typeof attendanceReportSchema>;

export const leaveReportSchema = withRangeRefine(
  z.object({
    ...baseDateRangeShape,
    departmentId: z.string().uuid().optional(),
    employeeId: z.string().uuid().optional(),
    leaveTypeId: z.string().uuid().optional(),
  }),
);
export type LeaveReportInput = z.infer<typeof leaveReportSchema>;

export const payrollReportSchema = withRangeRefine(
  z.object({
    ...baseDateRangeShape,
    status: z
      .enum(["DRAFT", "PROCESSING", "PROCESSED", "APPROVED", "DISBURSED", "CANCELLED", "FAILED"])
      .optional(),
  }),
);
export type PayrollReportInput = z.infer<typeof payrollReportSchema>;

export const activityReportSchema = withRangeRefine(
  z.object({
    ...baseDateRangeShape,
    userId: z.string().uuid().optional(),
    entityType: z.string().trim().min(1).max(60).optional(),
    action: z.string().trim().min(1).max(80).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  }),
);
export type ActivityReportInput = z.infer<typeof activityReportSchema>;

export const dashboardSummarySchema = dateRangeSchema;
export type DashboardSummaryInput = z.infer<typeof dashboardSummarySchema>;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Defaults a date-range query to the last `days` calendar days (UTC),
 * inclusive of today. The caller always receives a concrete `from`/`to`
 * so downstream aggregations don't have to branch on `undefined`.
 */
export function resolveDateRange(
  input: { dateFrom?: Date; dateTo?: Date },
  days = 30,
): { dateFrom: Date; dateTo: Date } {
  const to =
    input.dateTo ??
    (() => {
      const d = new Date();
      d.setUTCHours(23, 59, 59, 999);
      return d;
    })();
  const from =
    input.dateFrom ??
    (() => {
      const d = new Date(to);
      d.setUTCDate(d.getUTCDate() - (days - 1));
      d.setUTCHours(0, 0, 0, 0);
      return d;
    })();
  return { dateFrom: from, dateTo: to };
}
