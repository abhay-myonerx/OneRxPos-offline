// United States payroll preset (static, repo-shipped).
// DISCLAIMER: Tax rates are advisory scaffolding only. Tenants must verify
// with their payroll tax advisor / CPA before using for live payroll.

import Decimal from "decimal.js";
import type { PresetFormulaCtx } from "./index";

export const US_COMPONENTS = [
  {
    name: "Base Salary",
    code: "BASIC",
    type: "EARNING" as const,
    calcMethod: "FIXED" as const,
    isTaxable: true,
    displayOrder: 10,
  },
  {
    name: "Federal Income Tax (est.)",
    code: "FIT",
    type: "STATUTORY_DEDUCTION" as const,
    calcMethod: "FORMULA" as const,
    formulaKey: "US_FIT",
    isTaxable: false,
    displayOrder: 100,
  },
  {
    name: "Social Security (FICA)",
    code: "SS_EMP",
    type: "STATUTORY_DEDUCTION" as const,
    calcMethod: "PERCENT_OF_GROSS" as const,
    percentValue: new Decimal("6.20"),
    isTaxable: false,
    displayOrder: 110,
  },
  {
    name: "Medicare (FICA)",
    code: "MEDICARE_EMP",
    type: "STATUTORY_DEDUCTION" as const,
    calcMethod: "PERCENT_OF_GROSS" as const,
    percentValue: new Decimal("1.45"),
    isTaxable: false,
    displayOrder: 120,
  },
  {
    name: "Social Security (Employer)",
    code: "SS_EMP_CONTRIB",
    type: "EMPLOYER_CONTRIBUTION" as const,
    calcMethod: "PERCENT_OF_GROSS" as const,
    percentValue: new Decimal("6.20"),
    isTaxable: false,
    displayOrder: 200,
  },
  {
    name: "Medicare (Employer)",
    code: "MEDICARE_EMP_CONTRIB",
    type: "EMPLOYER_CONTRIBUTION" as const,
    calcMethod: "PERCENT_OF_GROSS" as const,
    percentValue: new Decimal("1.45"),
    isTaxable: false,
    displayOrder: 210,
  },
];

// Simplified flat-rate FIT estimate (22% bracket — advisory only).
export const US_FORMULAS: Record<string, (ctx: PresetFormulaCtx) => Decimal> = {
  US_FIT: (ctx) => ctx.grossPay.times("0.22").toDecimalPlaces(4),
};
