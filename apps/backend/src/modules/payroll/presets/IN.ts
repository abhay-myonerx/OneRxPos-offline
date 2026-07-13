// India payroll preset (static, repo-shipped).
// Components: Basic, HRA 40%, Special Allowance, PF, Professional Tax.
// DISCLAIMER: Statutory rates are advisory scaffolding — verify with CA.

import Decimal from "decimal.js";
import type { PresetFormulaCtx } from "./index";

export const IN_COMPONENTS = [
  {
    name: "Basic",
    code: "BASIC",
    type: "EARNING" as const,
    calcMethod: "FIXED" as const,
    isTaxable: true,
    displayOrder: 10,
  },
  {
    name: "House Rent Allowance",
    code: "HRA",
    type: "EARNING" as const,
    calcMethod: "PERCENT_OF_BASIC" as const,
    percentValue: new Decimal("40.00"),
    isTaxable: true,
    displayOrder: 20,
  },
  {
    name: "Special Allowance",
    code: "SPECIAL",
    type: "EARNING" as const,
    calcMethod: "FIXED" as const,
    isTaxable: true,
    displayOrder: 30,
  },
  {
    name: "Provident Fund (Employee 12%)",
    code: "PF_EMP",
    type: "STATUTORY_DEDUCTION" as const,
    calcMethod: "PERCENT_OF_BASIC" as const,
    percentValue: new Decimal("12.00"),
    isTaxable: false,
    displayOrder: 100,
  },
  {
    name: "Professional Tax",
    code: "PT",
    type: "STATUTORY_DEDUCTION" as const,
    calcMethod: "FORMULA" as const,
    formulaKey: "IN_PT",
    isTaxable: false,
    displayOrder: 110,
  },
  {
    name: "Provident Fund (Employer 12%)",
    code: "PF_EMP_CONTRIB",
    type: "EMPLOYER_CONTRIBUTION" as const,
    calcMethod: "PERCENT_OF_BASIC" as const,
    percentValue: new Decimal("12.00"),
    isTaxable: false,
    displayOrder: 200,
  },
];

// India Professional Tax: ₹200/mo if gross > ₹10,000 (Karnataka slab — advisory).
export const IN_FORMULAS: Record<string, (ctx: PresetFormulaCtx) => Decimal> = {
  IN_PT: (ctx) => (ctx.grossPay.gt("10000") ? new Decimal("200.0000") : new Decimal("0")),
};
