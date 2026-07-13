import type { ProvinceCode, ProvinceProfile, TaxComponent } from "../types/tax.types";

const gst = (): TaxComponent => ({ code: "GST", axis: "FEDERAL", ratePct: "5", base: "ON_NET" });
const pst = (rate: string, code: "PST" | "RST" = "PST"): TaxComponent =>
  ({ code, axis: "PROVINCIAL", ratePct: rate, base: "ON_NET" });
const qst = (): TaxComponent => ({ code: "QST", axis: "PROVINCIAL", ratePct: "9.975", base: "ON_NET" });
/** HST split so provincial relief can zero only the provincial slice. */
const hst = (provincialRate: string): TaxComponent[] => [
  { code: "HST", axis: "FEDERAL", ratePct: "5", base: "ON_NET" },
  { code: "HST", axis: "PROVINCIAL", ratePct: provincialRate, base: "ON_NET" },
];

/**
 * Effective-dated profiles, newest first per province. `getProvinceProfile`
 * returns the first whose effectiveFrom <= `at`.
 * Rates verified against Retail Council of Canada / TaxTips.ca on 2026-07-05.
 */
const PROFILES: Record<ProvinceCode, ProvinceProfile[]> = {
  AB: [{ province: "AB", effectiveFrom: "1991-01-01", components: [gst()] }],
  NT: [{ province: "NT", effectiveFrom: "1991-01-01", components: [gst()] }],
  NU: [{ province: "NU", effectiveFrom: "1991-01-01", components: [gst()] }],
  YT: [{ province: "YT", effectiveFrom: "1991-01-01", components: [gst()] }],
  BC: [{ province: "BC", effectiveFrom: "2013-04-01", components: [gst(), pst("7")] }],
  SK: [{ province: "SK", effectiveFrom: "2017-03-23", components: [gst(), pst("6")] }],
  MB: [{ province: "MB", effectiveFrom: "2019-07-01", components: [gst(), pst("7", "RST")] }],
  QC: [{ province: "QC", effectiveFrom: "2013-01-01", components: [gst(), qst()] }],
  ON: [{ province: "ON", effectiveFrom: "2010-07-01", components: hst("8") }],
  NB: [{ province: "NB", effectiveFrom: "2016-07-01", components: hst("10") }],
  NL: [{ province: "NL", effectiveFrom: "2016-07-01", components: hst("10") }],
  PE: [{ province: "PE", effectiveFrom: "2016-10-01", components: hst("10") }],
  NS: [
    { province: "NS", effectiveFrom: "2025-04-01", components: hst("9") }, // 14% total
    { province: "NS", effectiveFrom: "2010-07-01", components: hst("10") }, // 15% total
  ],
};

export function getProvinceProfile(province: ProvinceCode, at: Date): ProvinceProfile {
  const list = PROFILES[province];
  if (!list) throw new Error(`No tax profile for province ${province}`);
  // Use local calendar components, not UTC: the POS runs in the store's local
  // timezone and tax-rate effective dates are legal calendar dates, so a
  // UTC-based conversion could select the wrong day's profile for a late-
  // evening sale near a rate-change boundary (e.g. NS 2025-04-01).
  const iso = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
  const match = list.find((p) => p.effectiveFrom <= iso);
  if (!match) throw new Error(`No tax profile for ${province} effective on or before ${iso}`);
  return match;
}
