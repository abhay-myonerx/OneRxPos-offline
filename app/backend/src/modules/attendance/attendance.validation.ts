// Zod schemas for the HRM Attendance module.
//
// Per docs/v2/hrm-deep-dives/2.hrm-attendance.md. The biometric webhook
// endpoint (separate auth chain) and capture-method enforcement
// (geofence/IP/QR) are deferred — see OPEN_ITEMS OI-028..OI-029.

import { z } from "zod";

import { createListQuerySchema } from "../../shared/utils/listQuery";

const CHECK_EVENT_TYPE = ["CHECK_IN", "CHECK_OUT", "BREAK_START", "BREAK_END"] as const;

const ATTENDANCE_METHOD = [
  "MANUAL",
  "WEB",
  "MOBILE_APP",
  "GEOFENCE",
  "IP_RESTRICTED",
  "QR_CODE",
  "BIOMETRIC",
] as const;

const CORRECTION_STATUS = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;

export const idParamSchema = z.object({
  id: z.string().uuid("Invalid id"),
});

const geoSchema = z
  .object({
    lat: z.coerce.number().gte(-90).lte(90),
    lng: z.coerce.number().gte(-180).lte(180),
    accuracyM: z.coerce.number().int().min(0).max(100000).optional(),
  })
  .strict()
  .optional()
  .nullable();

// `employeeId` null/omitted ⇒ "me" (self-service). Providing it requires
// the manual-punch permission at the service layer and forces method=MANUAL.
export const punchSchema = z.object({
  employeeId: z.string().uuid().optional().nullable(),
  method: z.enum(ATTENDANCE_METHOD).default("WEB"),
  occurredAt: z.coerce.date().optional(),
  geo: geoSchema,
  deviceId: z.string().max(128).optional().nullable(),
  photoUrl: z.string().url().max(2000).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  // Single-use token required when
  // `method === "QR_CODE"`. Issued by GET
  // /api/v2/hr/attendance/qr-token (not exposed publicly — see
  // OI-029 follow-on). Validated server-side; consumed on success.
  qrToken: z.string().min(20).max(512).optional().nullable(),
});
export type PunchInput = z.infer<typeof punchSchema>;

export const listQuerySchema = createListQuerySchema({
  sortable: ["occurredAt", "createdAt", "eventType"] as const,
  defaultSortBy: "occurredAt",
  defaultSortOrder: "desc",
  filters: z.object({
    employeeId: z.string().uuid().optional(),
    storeId: z.string().uuid().optional(),
    eventType: z.enum(CHECK_EVENT_TYPE).optional(),
    method: z.enum(ATTENDANCE_METHOD).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    scope: z.enum(["self", "team", "all"]).optional(),
  }),
});
export type ListAttendanceInput = z.infer<typeof listQuerySchema>;

export const summaryQuerySchema = z
  .object({
    employeeId: z.string().uuid().optional(),
    from: z.coerce.date(),
    to: z.coerce.date(),
  })
  .refine((v) => v.to >= v.from, {
    path: ["to"],
    message: "`to` must be on or after `from`",
  })
  .refine((v) => (v.to.getTime() - v.from.getTime()) / (1000 * 60 * 60 * 24) <= 366, {
    path: ["to"],
    message: "Summary range must be 366 days or fewer",
  });
export type SummaryQueryInput = z.infer<typeof summaryQuerySchema>;

export const correctionCreateSchema = z.object({
  employeeId: z.string().uuid().optional().nullable(),
  requestedDate: z.coerce.date(),
  eventType: z.enum(CHECK_EVENT_TYPE),
  requestedTime: z.coerce.date(),
  reason: z.string().trim().min(3, "Reason is required").max(2000),
  evidenceUrl: z.string().url().max(2000).optional().nullable(),
});
export type CorrectionCreateInput = z.infer<typeof correctionCreateSchema>;

export const correctionListQuerySchema = createListQuerySchema({
  sortable: ["createdAt", "updatedAt", "requestedDate", "status"] as const,
  defaultSortBy: "createdAt",
  defaultSortOrder: "desc",
  filters: z.object({
    employeeId: z.string().uuid().optional(),
    status: z.enum(CORRECTION_STATUS).optional(),
    scope: z.enum(["self", "team", "all"]).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
});
export type CorrectionListInput = z.infer<typeof correctionListQuerySchema>;

export const correctionDecisionSchema = z.object({
  managerNotes: z.string().trim().max(2000).optional().nullable(),
});
export type CorrectionDecisionInput = z.infer<typeof correctionDecisionSchema>;
