// Zod schemas for the HRM Shifts module // Per docs/v2/hrm-deep-dives/3.hrm-shifts.md.
//
// `endTime` < `startTime` is valid and means the shift crosses midnight.
// `nightDifferentialPct` is a percent value (e.g. 25.00 → +25%), not a
// flat amount.

import { z } from "zod";

import { createListQuerySchema } from "../../shared/utils/listQuery";

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

const HEX_COLOR = /^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/;

const hhmm = () => z.string().regex(HHMM, 'Time must be in "HH:mm" 24-hour format');

const SCHEDULE_STATUS = [
  "SCHEDULED",
  "COMPLETED",
  "ABSENT",
  "ON_LEAVE",
  "CANCELLED",
  "SWAPPED",
] as const;

const SWAP_STATUS = [
  "PENDING_PEER",
  "PENDING_MANAGER",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
] as const;

export const idParamSchema = z.object({
  id: z.string().uuid("Invalid id"),
});

// ─── WorkShift templates ───────────────────────────────────────────────────────

export const workShiftCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    code: z.string().trim().min(1).max(50),
    storeId: z.string().uuid().optional().nullable(),
    startTime: hhmm(),
    endTime: hhmm(),
    breakMinutes: z.coerce
      .number()
      .int()
      .min(0)
      .max(24 * 60)
      .default(0),
    graceMinutes: z.coerce.number().int().min(0).max(240).default(0),
    isNightShift: z.coerce.boolean().optional(),
    nightDifferentialPct: z.coerce.number().min(0).max(999.99).optional().nullable(),
    color: z.string().regex(HEX_COLOR, "Color must be #RRGGBB or #RRGGBBAA").optional().nullable(),
  })
  .refine((v) => v.startTime !== v.endTime, {
    path: ["endTime"],
    message: "startTime and endTime cannot be identical",
  });
export type WorkShiftCreateInput = z.infer<typeof workShiftCreateSchema>;

export const workShiftUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    code: z.string().trim().min(1).max(50).optional(),
    storeId: z.string().uuid().optional().nullable(),
    startTime: hhmm().optional(),
    endTime: hhmm().optional(),
    breakMinutes: z.coerce
      .number()
      .int()
      .min(0)
      .max(24 * 60)
      .optional(),
    graceMinutes: z.coerce.number().int().min(0).max(240).optional(),
    isNightShift: z.coerce.boolean().optional(),
    nightDifferentialPct: z.coerce.number().min(0).max(999.99).optional().nullable(),
    color: z.string().regex(HEX_COLOR).optional().nullable(),
    isActive: z.coerce.boolean().optional(),
  })
  .refine(
    (v) => v.startTime === undefined || v.endTime === undefined || v.startTime !== v.endTime,
    {
      path: ["endTime"],
      message: "startTime and endTime cannot be identical",
    },
  );
export type WorkShiftUpdateInput = z.infer<typeof workShiftUpdateSchema>;

export const workShiftListQuerySchema = createListQuerySchema({
  sortable: ["createdAt", "updatedAt", "name", "code", "startTime"] as const,
  defaultSortBy: "name",
  defaultSortOrder: "asc",
  filters: z.object({
    storeId: z.string().uuid().optional(),
    isActive: z.coerce.boolean().optional(),
    isNightShift: z.coerce.boolean().optional(),
  }),
});
export type WorkShiftListInput = z.infer<typeof workShiftListQuerySchema>;

// ─── ShiftSchedule (roster) ────────────────────────────────────────────────────

const scheduleEntrySchema = z
  .object({
    employeeId: z.string().uuid("employeeId is required"),
    scheduledDate: z.coerce.date(),
    workShiftId: z.string().uuid().optional().nullable(),
    storeId: z.string().uuid().optional().nullable(),
    isOffDay: z.coerce.boolean().optional(),
    notes: z.string().max(2000).optional().nullable(),
  })
  .refine((v) => (v.isOffDay ? true : !!v.workShiftId), {
    path: ["workShiftId"],
    message: "workShiftId is required unless isOffDay is true",
  });

export const scheduleBulkCreateSchema = z.object({
  entries: z
    .array(scheduleEntrySchema)
    .min(1, "At least one entry is required")
    .max(500, "At most 500 entries per request"),
  overrideExisting: z.coerce.boolean().optional(),
});
export type ScheduleBulkCreateInput = z.infer<typeof scheduleBulkCreateSchema>;

export const scheduleUpdateSchema = z.object({
  workShiftId: z.string().uuid().optional().nullable(),
  storeId: z.string().uuid().optional().nullable(),
  scheduledDate: z.coerce.date().optional(),
  isOffDay: z.coerce.boolean().optional(),
  notes: z.string().max(2000).optional().nullable(),
  status: z.enum(SCHEDULE_STATUS).optional(),
});
export type ScheduleUpdateInput = z.infer<typeof scheduleUpdateSchema>;

export const scheduleListQuerySchema = createListQuerySchema({
  sortable: ["scheduledDate", "createdAt", "status"] as const,
  defaultSortBy: "scheduledDate",
  defaultSortOrder: "asc",
  filters: z.object({
    employeeId: z.string().uuid().optional(),
    storeId: z.string().uuid().optional(),
    workShiftId: z.string().uuid().optional(),
    status: z.enum(SCHEDULE_STATUS).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    scope: z.enum(["self", "team", "all"]).optional(),
    isOffDay: z.coerce.boolean().optional(),
  }),
});
export type ScheduleListInput = z.infer<typeof scheduleListQuerySchema>;

// ─── ShiftSwapRequest ──────────────────────────────────────────────────────────

export const swapRequestCreateSchema = z.object({
  requesterScheduleId: z.string().uuid(),
  counterpartEmployeeId: z.string().uuid(),
  counterpartScheduleId: z.string().uuid().optional().nullable(),
  reason: z.string().trim().max(2000).optional().nullable(),
});
export type SwapRequestCreateInput = z.infer<typeof swapRequestCreateSchema>;

export const swapRespondSchema = z.object({
  accept: z.coerce.boolean(),
});
export type SwapRespondInput = z.infer<typeof swapRespondSchema>;

export const swapApproveSchema = z.object({
  approve: z.coerce.boolean(),
  decisionNotes: z.string().trim().max(2000).optional().nullable(),
});
export type SwapApproveInput = z.infer<typeof swapApproveSchema>;

export const swapListQuerySchema = createListQuerySchema({
  sortable: ["createdAt", "updatedAt", "status", "expiresAt"] as const,
  defaultSortBy: "createdAt",
  defaultSortOrder: "desc",
  filters: z.object({
    status: z.enum(SWAP_STATUS).optional(),
    scope: z.enum(["mine", "incoming", "to-approve", "all"]).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
});
export type SwapListInput = z.infer<typeof swapListQuerySchema>;
