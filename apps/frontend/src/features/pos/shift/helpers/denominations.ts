/**
 * Canadian cash denominations for till counts (Phase 1.4). No penny — Canada
 * withdrew it in 2013; cash totals round to the nearest 5¢ elsewhere, but a
 * drawer still holds nickels. Counts are keyed by the denomination value as a
 * string (e.g. "20", "0.25") — the same shape the backend parses.
 */
export interface Denomination {
  /** Dollar value. */
  value: number;
  /** Display label. */
  label: string;
  kind: "bill" | "coin";
  /** Stable key used in the counts map + API payload. */
  key: string;
}

export const CAD_DENOMINATIONS: Denomination[] = [
  { value: 100, label: "$100", kind: "bill", key: "100" },
  { value: 50, label: "$50", kind: "bill", key: "50" },
  { value: 20, label: "$20", kind: "bill", key: "20" },
  { value: 10, label: "$10", kind: "bill", key: "10" },
  { value: 5, label: "$5", kind: "bill", key: "5" },
  { value: 2, label: "$2", kind: "coin", key: "2" },
  { value: 1, label: "$1", kind: "coin", key: "1" },
  { value: 0.25, label: "25¢", kind: "coin", key: "0.25" },
  { value: 0.1, label: "10¢", kind: "coin", key: "0.10" },
  { value: 0.05, label: "5¢", kind: "coin", key: "0.05" },
];

export type DenominationCounts = Record<string, number>;

/** Sum a denomination count to a dollar total, in cents to avoid float drift. */
export function countTotal(counts: DenominationCounts): number {
  let cents = 0;
  for (const [key, n] of Object.entries(counts)) {
    if (!n || n < 0) continue;
    cents += Math.round(parseFloat(key) * 100) * n;
  }
  return cents / 100;
}
