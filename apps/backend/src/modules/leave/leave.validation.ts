// Zod schemas for the HRM Leave module // Per docs/v2/hrm-deep-dives/4.hrm-leave.md §6 + API Reference §26.

import { z } from "zod";

import { createListQuerySchema } from "../../shared/utils/listQuery";

const HEX_COLOR = /^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const isoDate = () =>
  z
    .string()
    .regex(ISO_DATE, "Date must be in YYYY-MM-DD format")
    .transform((s: string) => new Date(s + "T00:00:00.000Z"));

const ACCRUAL_METHODS = ["ANNUAL_LUMP", "MONTHLY_ACCRUAL", "PER_WORKED_DAYS", "NONE"] as const;

const REQUEST_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "CANCELLED_POST",
] as const;

export const idParamSchema = z.object({
  id: z.string().uuid("Invalid id"),
});

// ─── Leave Type ────────────────────────────────────────────────────────────────

export const leaveTypeCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  code: z.string().trim().min(1).max(50),
  isPaid: z.coerce.boolean().optional().default(true),
  isBalanceTracked: z.coerce.boolean().optional().default(true),
  allowHalfDay: z.coerce.boolean().optional().default(true),
  requiresDocument: z.coerce.boolean().optional().default(false),
  maxConsecutiveDays: z.coerce.number().int().min(1).optional().nullable(),
  color: z.string().regex(HEX_COLOR, "Color must be #RRGGBB or #RRGGBBAA").optional().nullable(),
});
export type LeaveTypeCreateInput = z.infer<typeof leaveTypeCreateSchema>;

export const leaveTypeUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  code: z.string().trim().min(1).max(50).optional(),
  isPaid: z.coerce.boolean().optional(),
  isBalanceTracked: z.coerce.boolean().optional(),
  allowHalfDay: z.coerce.boolean().optional(),
  requiresDocument: z.coerce.boolean().optional(),
  maxConsecutiveDays: z.coerce.number().int().min(1).optional().nullable(),
  color: z.string().regex(HEX_COLOR).optional().nullable(),
});
export type LeaveTypeUpdateInput = z.infer<typeof leaveTypeUpdateSchema>;

export const leaveTypeListQuerySchema = createListQuerySchema({
  sortable: ["createdAt", "updatedAt", "name", "code"] as const,
  defaultSortBy: "name",
  defaultSortOrder: "asc",
  filters: z.object({
    isActive: z.coerce.boolean().optional(),
    isPaid: z.coerce.boolean().optional(),
    isBalanceTracked: z.coerce.boolean().optional(),
  }),
});
export type LeaveTypeListInput = z.infer<typeof leaveTypeListQuerySchema>;

// ─── Leave Policy ──────────────────────────────────────────────────────────────

export const leavePolicyCreateSchema = z.object({
  leaveTypeId: z.string().uuid(),
  designationLevel: z.coerce.number().int().min(1).optional().nullable(),
  entitledDaysPerYear: z.coerce
    .number()
    .min(0)
    .max(365)
    .transform((n: number) => n.toFixed(2)),
  accrualMethod: z.enum(ACCRUAL_METHODS).optional().default("ANNUAL_LUMP"),
  carryForwardMax: z.coerce.number().min(0).max(365).optional().nullable(),
  carryForwardExpiryMonths: z.coerce.number().int().min(1).max(36).optional().nullable(),
  minTenureMonths: z.coerce.number().int().min(0).optional().default(0),
});
export type LeavePolicyCreateInput = z.infer<typeof leavePolicyCreateSchema>;

export const leavePolicyUpdateSchema = z.object({
  designationLevel: z.coerce.number().int().min(1).optional().nullable(),
  entitledDaysPerYear: z.coerce
    .number()
    .min(0)
    .max(365)
    .transform((n: number) => n.toFixed(2))
    .optional(),
  accrualMethod: z.enum(ACCRUAL_METHODS).optional(),
  carryForwardMax: z.coerce.number().min(0).max(365).optional().nullable(),
  carryForwardExpiryMonths: z.coerce.number().int().min(1).max(36).optional().nullable(),
  minTenureMonths: z.coerce.number().int().min(0).optional(),
  isActive: z.coerce.boolean().optional(),
});
export type LeavePolicyUpdateInput = z.infer<typeof leavePolicyUpdateSchema>;

export const leavePolicyListQuerySchema = createListQuerySchema({
  sortable: ["createdAt", "updatedAt"] as const,
  defaultSortBy: "createdAt",
  defaultSortOrder: "desc",
  filters: z.object({
    leaveTypeId: z.string().uuid().optional(),
    isActive: z.coerce.boolean().optional(),
  }),
});
export type LeavePolicyListInput = z.infer<typeof leavePolicyListQuerySchema>;

// ─── Leave Balance ─────────────────────────────────────────────────────────────

export const leaveBalanceListQuerySchema = createListQuerySchema({
  sortable: ["updatedAt"] as const,
  defaultSortBy: "updatedAt",
  defaultSortOrder: "desc",
  filters: z.object({
    employeeId: z.string().uuid().optional(),
    leaveTypeId: z.string().uuid().optional(),
    cycleYear: z.coerce.number().int().min(2000).max(2100).optional(),
    scope: z.enum(["self", "team", "all"]).optional(),
  }),
});
export type LeaveBalanceListInput = z.infer<typeof leaveBalanceListQuerySchema>;

export const adjustBalanceSchema = z.object({
  employeeId: z.string().uuid(),
  leaveTypeId: z.string().uuid(),
  cycleYear: z.coerce.number().int().min(2000).max(2100),
  entitledDaysDelta: z.coerce.number().min(-365).max(365).optional(),
  carriedDaysDelta: z.coerce.number().min(-365).max(365).optional(),
  reason: z.string().trim().min(1).max(2000),
});
export type AdjustBalanceInput = z.infer<typeof adjustBalanceSchema>;

// ─── Leave Request ─────────────────────────────────────────────────────────────

export const leaveRequestCreateSchema = z
  .object({
    employeeId: z.string().uuid().optional().nullable(),
    leaveTypeId: z.string().uuid(),
    startDate: isoDate(),
    endDate: isoDate(),
    isHalfDay: z.coerce.boolean().optional().default(false),
    reason: z.string().trim().max(2000).optional().nullable(),
    documentUrl: z.string().url().max(2000).optional().nullable(),
  })
  .refine((v: { endDate: Date; startDate: Date }) => v.endDate >= v.startDate, {
    path: ["endDate"],
    message: "endDate must be on or after startDate",
  })
  .refine(
    (v: { endDate: Date; startDate: Date; isHalfDay?: boolean }) =>
      !v.isHalfDay ||
      v.startDate.toISOString().slice(0, 10) === v.endDate.toISOString().slice(0, 10),
    {
      path: ["isHalfDay"],
      message: "Half-day requests must be single-day (startDate = endDate)",
    },
  );
export type LeaveRequestCreateInput = z.infer<typeof leaveRequestCreateSchema>;

export const leaveRequestUpdateSchema = z.object({
  startDate: isoDate().optional(),
  endDate: isoDate().optional(),
  isHalfDay: z.coerce.boolean().optional(),
  reason: z.string().trim().max(2000).optional().nullable(),
  documentUrl: z.string().url().max(2000).optional().nullable(),
});
export type LeaveRequestUpdateInput = z.infer<typeof leaveRequestUpdateSchema>;

export const leaveRequestListQuerySchema = createListQuerySchema({
  sortable: ["createdAt", "updatedAt", "startDate", "endDate", "status"] as const,
  defaultSortBy: "createdAt",
  defaultSortOrder: "desc",
  filters: z.object({
    employeeId: z.string().uuid().optional(),
    leaveTypeId: z.string().uuid().optional(),
    status: z.enum(REQUEST_STATUSES).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    scope: z.enum(["self", "team", "all"]).optional(),
  }),
});
export type LeaveRequestListInput = z.infer<typeof leaveRequestListQuerySchema>;

export const leaveDecisionSchema = z.object({
  decisionNotes: z.string().trim().max(2000).optional().nullable(),
});
export type LeaveDecisionInput = z.infer<typeof leaveDecisionSchema>;
