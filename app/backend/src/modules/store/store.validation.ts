// Zod schemas for store endpoints

import { z } from "zod";

// Pricing Brain (Phase 1.2): store's province drives the shared tax engine's
// federal/provincial treatment at checkout (rx-pos-shared `getProvinceProfile`).
// Kept as a literal tuple (not imported from the Prisma enum) so this module
// has no compile-time dependency on the generated client shape.
const PROVINCE_CODES = [
  "ON", "QC", "BC", "AB", "MB", "SK", "NS", "NB", "NL", "PE", "NT", "NU", "YT",
] as const;

// ── Create store ────────────────────────────────────────────────────────────
export const createStoreSchema = z.object({
  name: z.string().min(1, "Store name is required").max(255),
  code: z
    .string()
    .min(1, "Store code is required")
    .max(50)
    .regex(
      /^[A-Z0-9_-]+$/,
      "Store code must be uppercase alphanumeric (hyphens and underscores allowed)",
    ),
  address: z.string().max(1000).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().email("Invalid email").optional().nullable(),
  province: z.enum(PROVINCE_CODES).optional().nullable(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export type CreateStoreInput = z.infer<typeof createStoreSchema>;

// ── Update store ────────────────────────────────────────────────────────────
export const updateStoreSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  code: z
    .string()
    .min(1)
    .max(50)
    .regex(
      /^[A-Z0-9_-]+$/,
      "Store code must be uppercase alphanumeric (hyphens and underscores allowed)",
    )
    .optional(),
  address: z.string().max(1000).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().email("Invalid email").optional().nullable(),
  province: z.enum(PROVINCE_CODES).optional().nullable(),
  isActive: z.boolean().optional(),
});

export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;

// ── Update store settings (JSON merge) ──────────────────────────────────────
export const updateStoreSettingsSchema = z
  .object({
    receiptHeader: z.string().max(500).optional(),
    receiptFooter: z.string().max(500).optional(),
    receiptShowLogo: z.boolean().optional(),
    defaultPaymentMethod: z.enum(["CASH", "CARD", "MOBILE_BANKING", "OTHER"]).optional(),
  })
  .passthrough();

export type UpdateStoreSettingsInput = z.infer<typeof updateStoreSettingsSchema>;

// ── Phase 21a / OI-030 — Geolocation + IP whitelist + attendance methods ────
//
// PATCH /api/v2/stores/:id/geolocation
// PATCH /api/v2/stores/:id/ip-whitelist
//
// Both required by the attendance method enforcement landed in
// OI-029. Explicit null on lat/lng/radius clears the geofence
// (back to "no geofence"). Empty array on ipWhitelist or
// attendanceMethods means "no restriction" (fail-open).

export const updateStoreGeolocationSchema = z
  .object({
    geoLat: z.number().min(-90).max(90).nullable().optional(),
    geoLng: z.number().min(-180).max(180).nullable().optional(),
    geoRadiusM: z.number().int().min(1).max(50_000).nullable().optional(),
  })
  .strict()
  .refine(
    // If you set one of the three you should set all three —
    // otherwise the validator can't run.
    (v) => {
      const set = [v.geoLat, v.geoLng, v.geoRadiusM].filter((x) => x !== null && x !== undefined);
      return set.length === 0 || set.length === 3;
    },
    {
      message: "Provide all three of geoLat / geoLng / geoRadiusM, or all null to clear",
    },
  );
export type UpdateStoreGeolocationInput = z.infer<typeof updateStoreGeolocationSchema>;

// CIDR ("203.0.113.0/24") or bare IPv4 ("203.0.113.5") — both
// accepted; bare IP normalised to /32 server-side.
const cidrLikeSchema = z
  .string()
  .regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(\/(3[0-2]|[12]?\d))?$/, "Must be IPv4 or IPv4/CIDR");

const ATTENDANCE_METHODS = [
  "WEB",
  "MANUAL",
  "GEOFENCE",
  "IP_RESTRICTED",
  "QR_CODE",
  "BIOMETRIC",
] as const;

export const updateStoreIpWhitelistSchema = z
  .object({
    ipWhitelist: z.array(cidrLikeSchema).max(200),
    attendanceMethods: z
      .array(z.enum(ATTENDANCE_METHODS))
      .max(ATTENDANCE_METHODS.length)
      .optional(),
  })
  .strict();
export type UpdateStoreIpWhitelistInput = z.infer<typeof updateStoreIpWhitelistSchema>;
