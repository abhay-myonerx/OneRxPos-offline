// Zod schemas for the HRM Holiday module // Per docs/v2/hrm-deep-dives/4.hrm-leave.md §11 + API Reference §26.

import { z } from "zod";

import { createListQuerySchema } from "../../shared/utils/listQuery";

const HOLIDAY_TYPES = ["PUBLIC", "RELIGIOUS", "OPTIONAL", "COMPANY"] as const;

const COUNTRY_CODES = ["US", "UK", "IN", "BD", "UAE"] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const isoDate = () =>
  z
    .string()
    .regex(ISO_DATE, "Date must be in YYYY-MM-DD format")
    .transform((s: string) => new Date(s + "T00:00:00.000Z"));

export const idParamSchema = z.object({
  id: z.string().uuid("Invalid id"),
});

export const holidayCreateSchema = z.object({
  name: z.string().trim().min(1).max(150),
  date: isoDate(),
  type: z.enum(HOLIDAY_TYPES).optional().default("PUBLIC"),
  storeId: z.string().uuid().optional().nullable(),
  isRecurring: z.coerce.boolean().optional().default(false),
  countryCode: z.string().max(3).optional().nullable(),
});
export type HolidayCreateInput = z.infer<typeof holidayCreateSchema>;

export const holidayUpdateSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  date: isoDate().optional(),
  type: z.enum(HOLIDAY_TYPES).optional(),
  storeId: z.string().uuid().optional().nullable(),
  isRecurring: z.coerce.boolean().optional(),
});
export type HolidayUpdateInput = z.infer<typeof holidayUpdateSchema>;

export const holidayListQuerySchema = createListQuerySchema({
  sortable: ["date", "name", "createdAt"] as const,
  defaultSortBy: "date",
  defaultSortOrder: "asc",
  filters: z.object({
    type: z.enum(HOLIDAY_TYPES).optional(),
    storeId: z.string().uuid().optional(),
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    isActive: z.coerce.boolean().optional(),
    isRecurring: z.coerce.boolean().optional(),
  }),
});
export type HolidayListInput = z.infer<typeof holidayListQuerySchema>;

export const holidayCalendarQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  storeId: z.string().uuid().optional().nullable(),
});
export type HolidayCalendarInput = z.infer<typeof holidayCalendarQuerySchema>;

export const holidayPresetImportSchema = z.object({
  countryCode: z.enum(COUNTRY_CODES),
  year: z.coerce.number().int().min(2000).max(2100),
  storeId: z.string().uuid().optional().nullable(),
});
export type HolidayPresetImportInput = z.infer<typeof holidayPresetImportSchema>;
