// Phase 2.1 — Drug schedule normalization (PURE, fully unit-tested).
//
// Maps a raw Health-Canada DPD federal schedule class string (e.g.
// "Prescription", "Narcotic (CDSA)", "OTC", "Schedule F", "Homeopathic") to the
// four normalized categories the Pharmacy plugin reasons about. 2.1 only
// CLASSIFIES; enforcement (blocking a sale) lands in 2.2.
//
// A drug can be multi-scheduled (the DPD ships several schedule rows per DIN, or
// a single class string can mention several federal classes). We always pick the
// MOST RESTRICTIVE category so we never under-classify a controlled substance:
//
//     NARCOTIC  >  NEEDS_RX  >  BEHIND_COUNTER  >  OPEN
//
// Mapping rules (case-insensitive substring match, spec §3):
//   • "narcotic" | "controlled" | "targeted"  (CDSA classes)          → NARCOTIC
//   • "prescription" | "schedule f" | "ethical"                       → NEEDS_RX
//   • pharmacist-only | "behind" | "schedule ii"                      → BEHIND_COUNTER
//   • "otc" | "unscheduled" | "homeopathic" | "schedule iii" |
//     "schedule i" (NAPRA — not clearly Rx) | unknown / empty         → OPEN
//
// Note on NAPRA vs. CDSA numerals: NAPRA "Schedule I" means Rx-only, but the DPD
// federal class does NOT use NAPRA numerals — the strings we see are federal
// ("Prescription", "Narcotic (CDSA)", "OTC", …). Per the spec we leave bare
// "schedule i" / "schedule iii" as OPEN unless another token makes it clearly Rx;
// "schedule ii" is treated as the pharmacist-only / behind-counter tier.

import { DrugScheduleCategory } from "@/generated/prisma/enums";

// Restrictiveness rank — higher wins when a class matches multiple tiers.
const RANK: Record<DrugScheduleCategory, number> = {
  [DrugScheduleCategory.NARCOTIC]: 3,
  [DrugScheduleCategory.NEEDS_RX]: 2,
  [DrugScheduleCategory.BEHIND_COUNTER]: 1,
  [DrugScheduleCategory.OPEN]: 0,
};

// Ordered pattern → category rules. Order does not matter for correctness because
// we take the max rank across ALL matches, but they read most→least restrictive.
// Regexes (not plain substring) so "schedule ii" does NOT swallow "schedule iii"
// (the `(?!i)` negative-lookahead guards that collision) and short tokens match
// on word boundaries.
const RULES: Array<{ patterns: RegExp[]; category: DrugScheduleCategory }> = [
  {
    // CDSA controlled substances — narcotics, controlled drugs, targeted substances.
    patterns: [/narcotic/, /controlled/, /targeted/, /cdsa/],
    category: DrugScheduleCategory.NARCOTIC,
  },
  {
    // Prescription-required (federal "Prescription", legacy "Schedule F"/"Ethical").
    patterns: [/prescription/, /schedule\s*f\b/, /ethical/],
    category: DrugScheduleCategory.NEEDS_RX,
  },
  {
    // Pharmacist-only / behind-the-counter (NAPRA Schedule II analog).
    patterns: [/pharmacist/, /behind/, /schedule\s*ii(?!i)/],
    category: DrugScheduleCategory.BEHIND_COUNTER,
  },
  {
    // Open sale — OTC / unscheduled / homeopathic / NAPRA Schedule III.
    patterns: [/\botc\b/, /unscheduled/, /homeopathic/, /schedule\s*iii/],
    category: DrugScheduleCategory.OPEN,
  },
];

/**
 * Normalize a raw DPD schedule class string to a {@link DrugScheduleCategory}.
 * Case-insensitive. Unknown / empty / null → OPEN (fail-open for classification;
 * 2.2 enforcement is additive on top and does not rely on this defaulting to a
 * restrictive value).
 *
 * @param raw The DPD schedule class string (may be empty/unknown).
 * @returns The most restrictive category any recognized token implies.
 */
export function mapDpdScheduleToCategory(raw: string | null | undefined): DrugScheduleCategory {
  if (!raw || !raw.trim()) return DrugScheduleCategory.OPEN;
  const hay = raw.toLowerCase();

  let best: DrugScheduleCategory | null = null;
  for (const rule of RULES) {
    if (rule.patterns.some((re) => re.test(hay))) {
      if (best === null || RANK[rule.category] > RANK[best]) best = rule.category;
    }
  }

  return best ?? DrugScheduleCategory.OPEN;
}
