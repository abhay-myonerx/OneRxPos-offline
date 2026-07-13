// Zod schemas for the ESS module.
// Per docs/v2/hrm-deep-dives/6.hrm-ess.md §9 and API Reference §28.2.
//
// The profile whitelist is intentionally STRICT (`.strict()`): unknown
// keys are rejected with a hard 400, never silently dropped. Identity,
// org, and compensation fields are unreachable through ESS.

import { z } from "zod";

import { createListQuerySchema } from "../../shared/utils/listQuery";

// ─── Profile self-edit whitelist (deep-dive §9, API §28.2) ─────────────────────

const emergencyContactSchema = z
  .object({
    name: z.string().trim().max(200).optional().nullable(),
    relationship: z.string().trim().max(100).optional().nullable(),
    phone: z.string().trim().max(50).optional().nullable(),
    email: z.string().trim().email().max(255).optional().nullable(),
    address: z.string().trim().max(500).optional().nullable(),
  })
  .strict()
  .nullable();

// Preferences persistence. Frontend
// previously stored these client-side (A-023); now they ride
// with the User account so they follow the user across devices.
const preferencesSchema = z
  .object({
    languagePreference: z
      .string()
      .regex(/^[a-z]{2}(-[A-Z]{2})?$/, "Use ISO 639-1 / language tag")
      .optional(),
    themePreference: z.enum(["light", "dark", "system"]).optional(),
    // Forward-compat — unknown keys allowed via passthrough so
    // future UI prefs (sidebar collapsed, locale-specific
    // number formatting, etc.) don't need a backend release.
  })
  .passthrough();

export const profileUpdateSchema = z
  .object({
    phone: z.string().trim().max(50).optional().nullable(),
    alternatePhone: z.string().trim().max(50).optional().nullable(),
    address: z.string().trim().max(500).optional().nullable(),
    city: z.string().trim().max(100).optional().nullable(),
    state: z.string().trim().max(100).optional().nullable(),
    postalCode: z.string().trim().max(20).optional().nullable(),
    country: z.string().trim().max(100).optional().nullable(),
    emergencyContact: emergencyContactSchema.optional(),
    photo: z.string().url().max(2000).optional().nullable(),
    // Opt-in nested patch. When present the ESS
    // service writes to User.preferences (a shallow merge).
    preferences: preferencesSchema.optional(),
  })
  .strict();
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

// ESS document list query.
//
// Must go through `createListQuerySchema` so page/limit/sortBy/sortOrder
// get their defaults applied. The underlying documents service feeds
// these straight into `buildPrismaListQuery`; without the coerced
// defaults `orderBy`/`take`/`skip` are `undefined` and Prisma throws a
// `PrismaClientValidationError` (surfaced to the FE as INVALID_QUERY).
export const documentsListQuerySchema = createListQuerySchema({
  sortable: ["createdAt", "fileName", "documentType", "expiresAt"] as const,
  defaultSortBy: "createdAt",
  defaultSortOrder: "desc",
  filters: z.object({
    documentType: z.string().min(1).max(40).optional(),
  }),
});
export type DocumentsListInput = z.infer<typeof documentsListQuerySchema>;

// ─── Attendance ───────────────────────────────────────────────────────────────

export const attendanceListQuerySchema = createListQuerySchema({
  sortable: ["occurredAt", "createdAt", "eventType"] as const,
  defaultSortBy: "occurredAt",
  defaultSortOrder: "desc",
  filters: z.object({
    eventType: z.enum(["CHECK_IN", "CHECK_OUT", "BREAK_START", "BREAK_END"]).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
});
export type AttendanceListInput = z.infer<typeof attendanceListQuerySchema>;

const geoSchema = z
  .object({
    lat: z.coerce.number().gte(-90).lte(90),
    lng: z.coerce.number().gte(-180).lte(180),
    accuracyM: z.coerce.number().int().min(0).max(100000).optional(),
  })
  .strict()
  .optional()
  .nullable();

// No `employeeId` field — server forces self from resolveSelf.
const PUNCH_METHODS = [
  "WEB",
  "MOBILE_APP",
  "GEOFENCE",
  "IP_RESTRICTED",
  "QR_CODE",
  "BIOMETRIC",
] as const;

export const punchSchema = z
  .object({
    method: z.enum(PUNCH_METHODS).default("WEB"),
    occurredAt: z.coerce.date().optional(),
    geo: geoSchema,
    deviceId: z.string().max(128).optional().nullable(),
    photoUrl: z.string().url().max(2000).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
  })
  .strict();
export type PunchInput = z.infer<typeof punchSchema>;

export const regularizeSchema = z
  .object({
    requestedDate: z.coerce.date(),
    eventType: z.enum(["CHECK_IN", "CHECK_OUT", "BREAK_START", "BREAK_END"]),
    requestedTime: z.coerce.date(),
    reason: z.string().trim().min(3).max(2000),
    evidenceUrl: z.string().url().max(2000).optional().nullable(),
  })
  .strict();
export type RegularizeInput = z.infer<typeof regularizeSchema>;

export const summaryQuerySchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
  })
  .refine((v) => v.to >= v.from, {
    path: ["to"],
    message: "`to` must be on or after `from`",
  });
export type SummaryQueryInput = z.infer<typeof summaryQuerySchema>;

// ─── Shifts ───────────────────────────────────────────────────────────────────

export const shiftsListQuerySchema = createListQuerySchema({
  sortable: ["scheduledDate", "createdAt", "status"] as const,
  defaultSortBy: "scheduledDate",
  defaultSortOrder: "asc",
  filters: z.object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    isOffDay: z.coerce.boolean().optional(),
  }),
});
export type ShiftsListInput = z.infer<typeof shiftsListQuerySchema>;

export const swapRequestSchema = z
  .object({
    requesterScheduleId: z.string().uuid(),
    counterpartEmployeeId: z.string().uuid(),
    counterpartScheduleId: z.string().uuid().optional().nullable(),
    reason: z.string().trim().max(2000).optional().nullable(),
  })
  .strict();
export type SwapRequestInput = z.infer<typeof swapRequestSchema>;

export const swapRespondSchema = z
  .object({
    accept: z.coerce.boolean(),
  })
  .strict();
export type SwapRespondInput = z.infer<typeof swapRespondSchema>;

// ─── Leave ────────────────────────────────────────────────────────────────────

export const leaveBalanceQuerySchema = z
  .object({
    leaveTypeId: z.string().uuid().optional(),
    cycleYear: z.coerce.number().int().min(1900).max(3000).optional(),
  })
  .strict();
export type LeaveBalanceQueryInput = z.infer<typeof leaveBalanceQuerySchema>;

export const leaveRequestListQuerySchema = createListQuerySchema({
  sortable: ["createdAt", "updatedAt", "startDate", "endDate", "status"] as const,
  defaultSortBy: "createdAt",
  defaultSortOrder: "desc",
  filters: z.object({
    leaveTypeId: z.string().uuid().optional(),
    status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED", "CANCELLED_POST"]).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
});
export type LeaveRequestListInput = z.infer<typeof leaveRequestListQuerySchema>;

// Client never supplies employeeId — server forces self.
export const leaveApplySchema = z
  .object({
    leaveTypeId: z.string().uuid(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    isHalfDay: z.coerce.boolean().optional().default(false),
    reason: z.string().trim().max(2000).optional().nullable(),
    documentUrl: z.string().url().max(2000).optional().nullable(),
  })
  .strict()
  .refine((v) => v.endDate >= v.startDate, {
    path: ["endDate"],
    message: "endDate must be on or after startDate",
  })
  .refine(
    (v) =>
      !v.isHalfDay ||
      v.startDate.toISOString().slice(0, 10) === v.endDate.toISOString().slice(0, 10),
    {
      path: ["isHalfDay"],
      message: "Half-day requests must be single-day (startDate = endDate)",
    },
  );
export type LeaveApplyInput = z.infer<typeof leaveApplySchema>;

// ─── Payslips ─────────────────────────────────────────────────────────────────

export const payslipListQuerySchema = createListQuerySchema({
  sortable: ["createdAt", "periodStart", "periodEnd"] as const,
  defaultSortBy: "createdAt",
  defaultSortOrder: "desc",
  filters: z.object({
    status: z.enum(["FINALIZED", "VOIDED"]).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
});
export type PayslipListInput = z.infer<typeof payslipListQuerySchema>;

// ─── Holidays ─────────────────────────────────────────────────────────────────

export const holidaysQuerySchema = z
  .object({
    year: z.coerce.number().int().min(1900).max(3000),
  })
  .strict();
export type HolidaysQueryInput = z.infer<typeof holidaysQuerySchema>;

// ─── Params ───────────────────────────────────────────────────────────────────

export const idParamSchema = z.object({
  id: z.string().uuid("Invalid id"),
});
