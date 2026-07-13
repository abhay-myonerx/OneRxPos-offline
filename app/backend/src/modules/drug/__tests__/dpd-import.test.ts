// Phase 2.1 — DPD importer tests. Parses the bundled sample extract, asserts the
// join correctness + schedule categories, and proves the upsert is idempotent
// (re-run = no dupes, updates in place). Uses a tiny in-memory fake for the
// global `drugProduct` client (no live DB in this repo's `npm test`).

import { describe, it, expect } from "vitest";

import {
  buildDrugProductRows,
  importDpd,
  parseCsvLine,
  DEFAULT_SAMPLE_DIR,
  type DrugProductRow,
} from "../dpd-import.service";
import { DrugScheduleCategory } from "@/generated/prisma/enums";

function rowByDin(rows: DrugProductRow[], din: string): DrugProductRow {
  const r = rows.find((x) => x.din === din);
  if (!r) throw new Error(`DIN ${din} not found in built rows`);
  return r;
}

describe("parseCsvLine", () => {
  it("splits comma-delimited fields and unwraps double quotes", () => {
    expect(parseCsvLine('1001,"TYLENOL WITH CODEINE NO.3","Narcotic (CDSA)"')).toEqual([
      "1001",
      "TYLENOL WITH CODEINE NO.3",
      "Narcotic (CDSA)",
    ]);
  });

  it("keeps commas that live inside a quoted field", () => {
    expect(parseCsvLine('1,"JOHNSON & JOHNSON, INC","X"')).toEqual([
      "1",
      "JOHNSON & JOHNSON, INC",
      "X",
    ]);
  });
});

describe("buildDrugProductRows (join over the sample extract)", () => {
  const rows = buildDrugProductRows(DEFAULT_SAMPLE_DIR);

  it("builds one row per DIN across all four categories", () => {
    expect(rows).toHaveLength(14);
    const cats = new Set(rows.map((r) => r.scheduleCategory));
    expect(cats).toEqual(
      new Set([
        DrugScheduleCategory.NARCOTIC,
        DrugScheduleCategory.NEEDS_RX,
        DrugScheduleCategory.BEHIND_COUNTER,
        DrugScheduleCategory.OPEN,
      ]),
    );
  });

  it("joins company / form / route / ingredients by DRUG_CODE", () => {
    const tylenol3 = rowByDin(rows, "00654523");
    expect(tylenol3.brandName).toBe("TYLENOL WITH CODEINE NO.3");
    expect(tylenol3.company).toBe("JANSSEN INC");
    expect(tylenol3.form).toBe("TABLET");
    expect(tylenol3.route).toBe("ORAL");
    // Two active ingredients joined from ingred.txt.
    expect(tylenol3.activeIngredients).toEqual([
      { name: "ACETAMINOPHEN", strength: "300 MG" },
      { name: "CODEINE PHOSPHATE", strength: "30 MG" },
    ]);
  });

  it("maps a multi-scheduled drug to the most restrictive category (NARCOTIC)", () => {
    const tylenol3 = rowByDin(rows, "00654523");
    // schedule.txt has both "Narcotic (CDSA)" and "Prescription" for this DIN.
    expect(tylenol3.scheduleClass).toContain("Narcotic (CDSA)");
    expect(tylenol3.scheduleClass).toContain("Prescription");
    expect(tylenol3.scheduleCategory).toBe(DrugScheduleCategory.NARCOTIC);
  });

  it("classifies representative DINs per category", () => {
    expect(rowByDin(rows, "02017830").scheduleCategory).toBe(DrugScheduleCategory.NARCOTIC); // Ativan (Targeted)
    expect(rowByDin(rows, "02238233").scheduleCategory).toBe(DrugScheduleCategory.NEEDS_RX); // Lipitor
    expect(rowByDin(rows, "02246568").scheduleCategory).toBe(DrugScheduleCategory.BEHIND_COUNTER); // Plan B (Sch II)
    expect(rowByDin(rows, "00559407").scheduleCategory).toBe(DrugScheduleCategory.OPEN); // Advil (OTC)
    expect(rowByDin(rows, "01934589").scheduleCategory).toBe(DrugScheduleCategory.OPEN); // Homeopathic
  });

  it("prefers the CURRENT status row (flag Y) and normalizes it", () => {
    // 1002 (OxyContin) has a historical DORMANT row + a current MARKETED row.
    expect(rowByDin(rows, "02244528").status).toBe("marketed");
    expect(rowByDin(rows, "80004939").status).toBe("dormant"); // Vitamin D
  });
});

// ── In-memory fake for the global drugProduct client ──────────────────────────
function makeFakeClient() {
  const store: Array<Record<string, unknown>> = [];
  return {
    store,
    drugProduct: {
      findUnique: async ({ where }: { where: { din: string } }) =>
        store.find((r) => r.din === where.din) ?? null,
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { din: string };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const idx = store.findIndex((r) => r.din === where.din);
        if (idx >= 0) {
          store[idx] = { ...store[idx], ...update };
          return store[idx];
        }
        const row = { id: `dp-${store.length + 1}`, ...create };
        store.push(row);
        return row;
      },
    },
  };
}

describe("importDpd (idempotent upsert)", () => {
  it("imports every sample DIN on a fresh run", async () => {
    const fake = makeFakeClient();
    const summary = await importDpd(fake as never, DEFAULT_SAMPLE_DIR);
    expect(summary.parsed).toBe(14);
    expect(summary.imported).toBe(14);
    expect(summary.updated).toBe(0);
    expect(fake.store).toHaveLength(14);
  });

  it("is idempotent — a second run updates in place, no duplicates", async () => {
    const fake = makeFakeClient();
    await importDpd(fake as never, DEFAULT_SAMPLE_DIR);
    const second = await importDpd(fake as never, DEFAULT_SAMPLE_DIR);

    expect(second.imported).toBe(0);
    expect(second.updated).toBe(14);
    expect(fake.store).toHaveLength(14); // still 14, not 28
  });
});
