// Phase 2.1 — Health Canada DPD (Drug Product Database) importer.
//
// The public DPD "extract" is a set of comma-delimited, header-less files joined
// by an internal integer `DRUG_CODE` key: drug / ingred / form / route /
// schedule / status / comp. This service reads those files from a directory,
// joins them by DRUG_CODE, maps each drug to a `DrugProduct`, and UPSERTS by DIN
// (idempotent — re-running updates, never duplicates).
//
// A bundled mini-extract lives at `prisma/seed-data/dpd-sample/` (all 7 files,
// 14 DINs spanning every schedule category) for dev + tests.
//
// ⚠ The column indices in `DPD_COLUMNS` are modelled on the DPD layout but MUST
// be verified against Health Canada's DPD "Read Me" before a real national
// import. That verification is an ops follow-up (P5 in the design).

import { readFileSync } from "fs";
import { join } from "path";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { DrugScheduleCategory } from "@/generated/prisma/enums";
import { mapDpdScheduleToCategory } from "./schedule-map";

// ── Column maps (field → 0-based index) — VERIFY against the DPD Read Me ───────
//
// Only the columns the importer consumes are listed; the real files carry more.
export const DPD_COLUMNS = {
  // QRYM_DRUG_PRODUCT
  drug: {
    DRUG_CODE: 0,
    DRUG_IDENTIFICATION_NUMBER: 3,
    BRAND_NAME: 4,
  },
  // QRYM_ACTIVE_INGREDIENTS (many rows per DRUG_CODE)
  ingred: {
    DRUG_CODE: 0,
    INGREDIENT: 2,
    STRENGTH: 4,
    STRENGTH_UNIT: 5,
  },
  // QRYM_FORM
  form: {
    DRUG_CODE: 0,
    PHARMACEUTICAL_FORM: 2,
  },
  // QRYM_ROUTE
  route: {
    DRUG_CODE: 0,
    ROUTE_OF_ADMINISTRATION: 2,
  },
  // QRYM_SCHEDULE (may be many rows per DRUG_CODE — a drug can be multi-scheduled)
  schedule: {
    DRUG_CODE: 0,
    SCHEDULE: 1,
  },
  // QRYM_STATUS (many rows; the CURRENT one carries flag "Y")
  status: {
    DRUG_CODE: 0,
    CURRENT_STATUS_FLAG: 1,
    STATUS: 2,
  },
  // QRYM_COMP
  comp: {
    DRUG_CODE: 0,
    COMPANY_NAME: 3,
  },
} as const;

// Filenames as shipped by Health Canada's DPD extract.
export const DPD_FILES = {
  drug: "drug.txt",
  ingred: "ingred.txt",
  form: "form.txt",
  route: "route.txt",
  schedule: "schedule.txt",
  status: "status.txt",
  comp: "comp.txt",
} as const;

// Default sample directory (relative to the backend package root).
export const DEFAULT_SAMPLE_DIR = join(
  __dirname,
  "..",
  "..",
  "..",
  "prisma",
  "seed-data",
  "dpd-sample",
);

export interface ActiveIngredient {
  name: string;
  strength: string | null;
}

export interface DrugProductRow {
  din: string;
  brandName: string;
  company: string | null;
  form: string | null;
  route: string | null;
  activeIngredients: ActiveIngredient[];
  scheduleClass: string | null;
  scheduleCategory: DrugScheduleCategory;
  status: string | null;
  npn: string | null;
}

export interface ImportSummary {
  parsed: number; // DrugProduct rows built from the extract
  imported: number; // newly created
  updated: number; // existing DINs updated
}

// ── CSV parsing ───────────────────────────────────────────────────────────────
//
// The DPD extract is comma-delimited with optional double-quoted fields (which
// may themselves contain commas). This is a minimal RFC-4180-ish line splitter —
// enough for the DPD shape, no external dependency.
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((f) => f.trim());
}

function parseFile(dir: string, filename: string): string[][] {
  const text = readFileSync(join(dir, filename), "utf8");
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map(parseCsvLine);
}

function nonEmpty(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  return s.length > 0 ? s : null;
}

// ── Join the extract files into DrugProduct rows ──────────────────────────────
export function buildDrugProductRows(dir: string): DrugProductRow[] {
  const drugRows = parseFile(dir, DPD_FILES.drug);
  const ingredRows = parseFile(dir, DPD_FILES.ingred);
  const formRows = parseFile(dir, DPD_FILES.form);
  const routeRows = parseFile(dir, DPD_FILES.route);
  const scheduleRows = parseFile(dir, DPD_FILES.schedule);
  const statusRows = parseFile(dir, DPD_FILES.status);
  const compRows = parseFile(dir, DPD_FILES.comp);

  const C = DPD_COLUMNS;

  // Index the child tables by DRUG_CODE.
  const ingredByCode = new Map<string, ActiveIngredient[]>();
  for (const r of ingredRows) {
    const code = r[C.ingred.DRUG_CODE];
    const name = nonEmpty(r[C.ingred.INGREDIENT]);
    if (!code || !name) continue;
    const strength = nonEmpty(r[C.ingred.STRENGTH]);
    const unit = nonEmpty(r[C.ingred.STRENGTH_UNIT]);
    const combined = strength ? `${strength}${unit ? ` ${unit}` : ""}` : null;
    const list = ingredByCode.get(code) ?? [];
    list.push({ name, strength: combined });
    ingredByCode.set(code, list);
  }

  const formByCode = new Map<string, string>();
  for (const r of formRows) {
    const code = r[C.form.DRUG_CODE];
    const form = nonEmpty(r[C.form.PHARMACEUTICAL_FORM]);
    if (code && form && !formByCode.has(code)) formByCode.set(code, form);
  }

  const routeByCode = new Map<string, string>();
  for (const r of routeRows) {
    const code = r[C.route.DRUG_CODE];
    const route = nonEmpty(r[C.route.ROUTE_OF_ADMINISTRATION]);
    if (code && route && !routeByCode.has(code)) routeByCode.set(code, route);
  }

  // A drug can be multi-scheduled — collect every schedule string per code.
  const scheduleByCode = new Map<string, string[]>();
  for (const r of scheduleRows) {
    const code = r[C.schedule.DRUG_CODE];
    const sched = nonEmpty(r[C.schedule.SCHEDULE]);
    if (!code || !sched) continue;
    const list = scheduleByCode.get(code) ?? [];
    list.push(sched);
    scheduleByCode.set(code, list);
  }

  // Prefer the CURRENT status row (flag "Y"); fall back to the first seen.
  const statusByCode = new Map<string, string>();
  for (const r of statusRows) {
    const code = r[C.status.DRUG_CODE];
    const status = nonEmpty(r[C.status.STATUS]);
    if (!code || !status) continue;
    const isCurrent = (r[C.status.CURRENT_STATUS_FLAG] ?? "").trim().toUpperCase() === "Y";
    if (isCurrent || !statusByCode.has(code)) statusByCode.set(code, status);
  }

  const companyByCode = new Map<string, string>();
  for (const r of compRows) {
    const code = r[C.comp.DRUG_CODE];
    const company = nonEmpty(r[C.comp.COMPANY_NAME]);
    if (code && company && !companyByCode.has(code)) companyByCode.set(code, company);
  }

  const rows: DrugProductRow[] = [];
  const seenDins = new Set<string>();
  for (const r of drugRows) {
    const code = r[C.drug.DRUG_CODE];
    const din = nonEmpty(r[C.drug.DRUG_IDENTIFICATION_NUMBER]);
    const brandName = nonEmpty(r[C.drug.BRAND_NAME]);
    if (!code || !din || !brandName) continue;
    if (seenDins.has(din)) continue; // guard against a duplicate DIN in the extract
    seenDins.add(din);

    const schedules = scheduleByCode.get(code) ?? [];
    const scheduleClass = schedules.length > 0 ? schedules.join("; ") : null;
    // Map over the JOINED string so the most-restrictive of a multi-schedule drug wins.
    const scheduleCategory = mapDpdScheduleToCategory(scheduleClass);

    const rawStatus = statusByCode.get(code) ?? null;
    // Normalize to the DPD status vocabulary's first word (marketed/cancelled/dormant).
    const status = rawStatus ? rawStatus.toLowerCase().split(/\s+/)[0] : null;

    rows.push({
      din,
      brandName,
      company: companyByCode.get(code) ?? null,
      form: formByCode.get(code) ?? null,
      route: routeByCode.get(code) ?? null,
      activeIngredients: ingredByCode.get(code) ?? [],
      scheduleClass,
      scheduleCategory,
      status,
      npn: null, // NPN comes from LNHPD (natural products) — import deferred (P4).
    });
  }

  return rows;
}

// ── Upsert by DIN (idempotent) ────────────────────────────────────────────────
//
// Uses the GLOBAL (un-scoped) `prisma` client — `DrugProduct` is reference data
// shared across all tenants and carries no tenantId.
export async function importDpd(
  prisma: Pick<PrismaClient, "drugProduct">,
  dir: string = DEFAULT_SAMPLE_DIR,
): Promise<ImportSummary> {
  const rows = buildDrugProductRows(dir);
  let imported = 0;
  let updated = 0;

  for (const row of rows) {
    const existing = await prisma.drugProduct.findUnique({
      where: { din: row.din },
      select: { id: true },
    });

    const ingredientsJson = row.activeIngredients as unknown as Prisma.InputJsonValue;
    await prisma.drugProduct.upsert({
      where: { din: row.din },
      create: {
        din: row.din,
        brandName: row.brandName,
        company: row.company,
        form: row.form,
        route: row.route,
        activeIngredients: ingredientsJson,
        scheduleClass: row.scheduleClass,
        scheduleCategory: row.scheduleCategory,
        status: row.status,
        npn: row.npn,
      },
      update: {
        brandName: row.brandName,
        company: row.company,
        form: row.form,
        route: row.route,
        activeIngredients: ingredientsJson,
        scheduleClass: row.scheduleClass,
        scheduleCategory: row.scheduleCategory,
        status: row.status,
        npn: row.npn,
      },
    });

    if (existing) updated++;
    else imported++;
  }

  return { parsed: rows.length, imported, updated };
}
