// HRM Holiday service // Per docs/v2/hrm-deep-dives/4.hrm-leave.md §11.
//
// Owns: Holiday CRUD + country preset import + calendar view.
//
// Preset import is idempotent: the unique constraint
// (tenant_id, store_id, date, name) prevents duplicates; re-importing
// for the same country/year is a no-op for existing rows.
//
// Presets are static JSON files under `./presets/` — no runtime
// third-party API calls.

import usPreset from "./presets/US.json";
import ukPreset from "./presets/UK.json";
import inPreset from "./presets/IN.json";
import bdPreset from "./presets/BD.json";
import uaePreset from "./presets/UAE.json";

import type { TenantPrismaClient } from "../../config/database";
import { NotFoundError } from "../../shared/errors";
import { buildPrismaListQuery, formatListResponse } from "../../shared/utils/listQuery";
import { recordAudit } from "../../shared/utils/auditLog";

import type {
  HolidayCalendarInput,
  HolidayCreateInput,
  HolidayListInput,
  HolidayPresetImportInput,
  HolidayUpdateInput,
} from "./holiday.validation";
import type { LeaveActor } from "../leave/leave.types";

// ─── Preset loader ─────────────────────────────────────────────────────────────

interface PresetHoliday {
  month: number;
  day: number;
  name: string;
  type: "PUBLIC" | "RELIGIOUS" | "OPTIONAL" | "COMPANY";
}

interface PresetFile {
  countryCode: string;
  holidays: PresetHoliday[];
}

const PRESET_MAP: Record<string, PresetFile> = {
  US: usPreset as PresetFile,
  UK: ukPreset as PresetFile,
  IN: inPreset as PresetFile,
  BD: bdPreset as PresetFile,
  UAE: uaePreset as PresetFile,
};

function loadPreset(countryCode: string): PresetFile {
  const preset = PRESET_MAP[countryCode];
  if (!preset) throw new Error(`Unknown preset country code: ${countryCode}`);
  return preset;
}

// ─── Select shape ──────────────────────────────────────────────────────────────

const holidaySelect = {
  id: true,
  tenantId: true,
  storeId: true,
  name: true,
  date: true,
  type: true,
  isRecurring: true,
  countryCode: true,
  isActive: true,
  createdAt: true,
} as const;

// ─── Service functions ─────────────────────────────────────────────────────────

export async function listHolidays(
  db: TenantPrismaClient,
  _actor: LeaveActor,
  params: HolidayListInput,
) {
  const { type, storeId, year, isActive, isRecurring, ...rest } = params as never as {
    type?: string;
    storeId?: string;
    year?: number;
    isActive?: boolean;
    isRecurring?: boolean;
  } & Record<string, unknown>;

  const extra: Record<string, unknown> = {};
  if (type) extra.type = type;
  if (storeId) extra.storeId = storeId;
  if (typeof isActive === "boolean") extra.isActive = isActive;
  if (typeof isRecurring === "boolean") extra.isRecurring = isRecurring;
  if (year) {
    extra.date = {
      gte: new Date(`${year}-01-01T00:00:00.000Z`),
      lte: new Date(`${year}-12-31T23:59:59.999Z`),
    };
  }

  const { where, orderBy, skip, take, meta } = buildPrismaListQuery(rest as never, {
    searchableFields: ["name"],
    extraWhere: extra,
  });
  const [rows, total] = await Promise.all([
    db.holiday.findMany({ where, orderBy, skip, take, select: holidaySelect }),
    db.holiday.count({ where }),
  ]);
  return formatListResponse(rows, total, meta);
}

export async function getHolidayById(db: TenantPrismaClient, _actor: LeaveActor, id: string) {
  const row = await db.holiday.findUnique({ where: { id }, select: holidaySelect });
  if (!row) throw new NotFoundError("Holiday not found");
  return row;
}

export async function createHoliday(
  db: TenantPrismaClient,
  actor: LeaveActor,
  input: HolidayCreateInput,
) {
  const row = await db.holiday.create({
    data: {
      tenantId: actor.tenantId,
      storeId: input.storeId ?? null,
      name: input.name,
      date: input.date,
      type: input.type,
      isRecurring: input.isRecurring ?? false,
      countryCode: input.countryCode ?? null,
    },
    select: holidaySelect,
  });
  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "HOLIDAY_CREATED",
    entityType: "Holiday",
    entityId: row.id,
    newData: row,
  });
  return row;
}

export async function updateHoliday(
  db: TenantPrismaClient,
  actor: LeaveActor,
  id: string,
  input: HolidayUpdateInput,
) {
  const existing = await db.holiday.findUnique({ where: { id }, select: holidaySelect });
  if (!existing) throw new NotFoundError("Holiday not found");

  const row = await db.holiday.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.date !== undefined && { date: input.date }),
      ...(input.type !== undefined && { type: input.type }),
      ...(input.storeId !== undefined && { storeId: input.storeId }),
      ...(input.isRecurring !== undefined && { isRecurring: input.isRecurring }),
    },
    select: holidaySelect,
  });
  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "HOLIDAY_UPDATED",
    entityType: "Holiday",
    entityId: row.id,
    oldData: existing,
    newData: row,
  });
  return row;
}

export async function deactivateHoliday(db: TenantPrismaClient, actor: LeaveActor, id: string) {
  const existing = await db.holiday.findUnique({ where: { id }, select: holidaySelect });
  if (!existing) throw new NotFoundError("Holiday not found");
  if (!existing.isActive) return existing;

  const row = await db.holiday.update({
    where: { id },
    data: { isActive: false },
    select: holidaySelect,
  });
  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "HOLIDAY_DEACTIVATED",
    entityType: "Holiday",
    entityId: row.id,
    oldData: existing,
    newData: row,
  });
  return row;
}

export async function importPreset(
  db: TenantPrismaClient,
  actor: LeaveActor,
  input: HolidayPresetImportInput,
) {
  const preset = loadPreset(input.countryCode);

  let created = 0;
  let skipped = 0;

  for (const h of preset.holidays) {
    // Date month/day given in preset for the requested year.
    const dateStr = `${input.year}-${String(h.month).padStart(2, "0")}-${String(h.day).padStart(2, "0")}`;
    const date = new Date(dateStr + "T00:00:00.000Z");

    // Idempotent: skip if the same (tenant, store, date, name) already exists.
    try {
      await db.holiday.create({
        data: {
          tenantId: actor.tenantId,
          storeId: input.storeId ?? null,
          name: h.name,
          date,
          type: h.type,
          isRecurring: true,
          countryCode: input.countryCode,
        },
      });
      created++;
    } catch (err: unknown) {
      // P2002 = unique constraint violation → already imported.
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: string }).code === "P2002"
      ) {
        skipped++;
      } else {
        throw err;
      }
    }
  }

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "HOLIDAY_PRESET_IMPORTED",
    entityType: "Holiday",
    entityId: `preset:${input.countryCode}:${input.year}`,
    newData: { countryCode: input.countryCode, year: input.year, created, skipped },
  });

  return { countryCode: input.countryCode, year: input.year, created, skipped };
}

export async function getCalendar(
  db: TenantPrismaClient,
  _actor: LeaveActor,
  input: HolidayCalendarInput,
) {
  const where: Record<string, unknown> = {
    isActive: true,
    date: {
      gte: new Date(`${input.year}-01-01T00:00:00.000Z`),
      lte: new Date(`${input.year}-12-31T23:59:59.999Z`),
    },
  };
  if (input.storeId) {
    where.OR = [{ storeId: null }, { storeId: input.storeId }];
  } else {
    where.storeId = null;
  }

  const rows = await db.holiday.findMany({
    where,
    orderBy: { date: "asc" },
    select: holidaySelect,
  });
  return { year: input.year, storeId: input.storeId ?? null, holidays: rows };
}

// Re-export isHoliday for use in the leave compute engine.
export { isHoliday } from "../leave/leave-compute.service";
