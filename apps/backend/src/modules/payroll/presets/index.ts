// Country preset registry for payroll.
// Each preset exports:
//   - <CC>_COMPONENTS  — default component set for the SalaryStructure
//   - <CC>_FORMULAS    — formulaKey → pure-fn registry for FORMULA-method components
//
// Formula functions are PURE and TOTAL: same inputs → same output.
// No I/O, no Date.now(), no randomness.
//
// DISCLAIMER: Statutory rates are advisory scaffolding. Tenants must
// verify statutory obligations with local legal/tax advisors.

import Decimal from "decimal.js";

import { BD_COMPONENTS, BD_FORMULAS } from "./BD";
import { US_COMPONENTS, US_FORMULAS } from "./US";
import { UK_COMPONENTS, UK_FORMULAS } from "./UK";
import { IN_COMPONENTS, IN_FORMULAS } from "./IN";
import { UAE_COMPONENTS, UAE_FORMULAS } from "./UAE";

export interface PresetFormulaCtx {
  grossPay: Decimal;
  basicPay: Decimal;
  daysWorked: Decimal;
  standardDays: number;
  currency: string;
}

export type PresetComponent = {
  name: string;
  code: string;
  type:
    | "EARNING"
    | "DEDUCTION"
    | "STATUTORY_DEDUCTION"
    | "EMPLOYER_CONTRIBUTION"
    | "REIMBURSEMENT"
    | "ADJUSTMENT";
  calcMethod: "FIXED" | "PERCENT_OF_BASIC" | "PERCENT_OF_GROSS" | "FORMULA" | "ATTENDANCE_DERIVED";
  fixedAmount?: Decimal;
  percentValue?: Decimal;
  formulaKey?: string;
  isTaxable: boolean;
  displayOrder: number;
};

export interface CountryPreset {
  countryCode: string;
  name: string;
  currency: string;
  components: PresetComponent[];
  formulas: Record<string, (ctx: PresetFormulaCtx) => Decimal>;
  disclaimer: string;
}

const DISCLAIMER =
  "Statutory rates are advisory scaffolding only. Verify all tax/social-security " +
  "rates with qualified legal and tax advisors before finalizing payroll. " +
  "RX POS and Antripe Digital Solutions accept no liability for statutory compliance.";

export const COUNTRY_PRESETS: Record<string, CountryPreset> = {
  BD: {
    countryCode: "BD",
    name: "Bangladesh",
    currency: "BDT",
    components: BD_COMPONENTS,
    formulas: BD_FORMULAS,
    disclaimer: DISCLAIMER,
  },
  US: {
    countryCode: "US",
    name: "United States",
    currency: "USD",
    components: US_COMPONENTS,
    formulas: US_FORMULAS,
    disclaimer: DISCLAIMER,
  },
  UK: {
    countryCode: "UK",
    name: "United Kingdom",
    currency: "GBP",
    components: UK_COMPONENTS,
    formulas: UK_FORMULAS,
    disclaimer: DISCLAIMER,
  },
  IN: {
    countryCode: "IN",
    name: "India",
    currency: "INR",
    components: IN_COMPONENTS,
    formulas: IN_FORMULAS,
    disclaimer: DISCLAIMER,
  },
  UAE: {
    countryCode: "UAE",
    name: "United Arab Emirates",
    currency: "AED",
    components: UAE_COMPONENTS,
    formulas: UAE_FORMULAS,
    disclaimer: DISCLAIMER,
  },
};

export function getPreset(countryCode: string): CountryPreset | undefined {
  return COUNTRY_PRESETS[countryCode.toUpperCase()];
}

export function listPresets(): Array<{
  countryCode: string;
  name: string;
  currency: string;
  disclaimer: string;
}> {
  return Object.values(COUNTRY_PRESETS).map((p) => ({
    countryCode: p.countryCode,
    name: p.name,
    currency: p.currency,
    disclaimer: p.disclaimer,
  }));
}
