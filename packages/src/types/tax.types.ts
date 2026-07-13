export type ProvinceCode =
  | "ON" | "QC" | "BC" | "AB" | "MB" | "SK"
  | "NS" | "NB" | "NL" | "PE" | "NT" | "NU" | "YT";

export type TaxCategory = "STANDARD" | "ZERO_RATED" | "PROVINCIAL_RELIEF" | "EXEMPT";
export type Axis = "FEDERAL" | "PROVINCIAL";
export type Treatment = "TAXABLE" | "ZERO" | "EXEMPT";
export type TaxComponentCode = "GST" | "HST" | "PST" | "QST" | "RST";
export type ExemptionType = "FIRST_NATIONS" | "DIPLOMATIC";

/** ON_NET = tax on the line net; onNetPlus = compound on net + named components. */
export type BaseRule = "ON_NET" | { onNetPlus: TaxComponentCode[] };

export interface TaxComponent {
  code: TaxComponentCode;
  axis: Axis;
  /** Percent as a decimal string, e.g. "9.975". */
  ratePct: string;
  base: BaseRule;
}

export interface ProvinceProfile {
  province: ProvinceCode;
  /** ISO date this profile takes effect. */
  effectiveFrom: string;
  components: TaxComponent[];
}

export type LevyMode = "FLAT_PER_UNIT" | "FLAT_PER_LINE" | "PERCENT";

export interface Levy {
  code: string;
  name: string;
  mode: LevyMode;
  /** Decimal string: dollars (FLAT_*) or percent (PERCENT). */
  amount: string;
  /** Whether the levy amount itself attracts tax. */
  taxable: boolean;
}
