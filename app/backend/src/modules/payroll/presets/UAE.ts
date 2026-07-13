// UAE payroll preset (static, repo-shipped).
// UAE has no income tax; GPSSA / GOSI applies to nationals.
// DISCLAIMER: Advisory scaffolding — verify with UAE Ministry of Labour.

import Decimal from "decimal.js";
import type { PresetFormulaCtx } from "./index";

export const UAE_COMPONENTS = [
  {
    name: "Basic Salary",
    code: "BASIC",
    type: "EARNING" as const,
    calcMethod: "FIXED" as const,
    isTaxable: false,
    displayOrder: 10,
  },
  {
    name: "Housing Allowance",
    code: "HOUSING",
    type: "EARNING" as const,
    calcMethod: "PERCENT_OF_BASIC" as const,
    percentValue: new Decimal("25.00"),
    isTaxable: false,
    displayOrder: 20,
  },
  {
    name: "Transportation Allowance",
    code: "TRANSPORT",
    type: "EARNING" as const,
    calcMethod: "FIXED" as const,
    fixedAmount: new Decimal("500.0000"),
    isTaxable: false,
    displayOrder: 30,
  },
  {
    name: "GPSSA (UAE National 5%)",
    code: "GPSSA_EMP",
    type: "STATUTORY_DEDUCTION" as const,
    calcMethod: "PERCENT_OF_BASIC" as const,
    percentValue: new Decimal("5.00"),
    isTaxable: false,
    displayOrder: 100,
  },
  {
    name: "GPSSA (Employer 12.5%)",
    code: "GPSSA_EMP_CONTRIB",
    type: "EMPLOYER_CONTRIBUTION" as const,
    calcMethod: "PERCENT_OF_BASIC" as const,
    percentValue: new Decimal("12.50"),
    isTaxable: false,
    displayOrder: 200,
  },
];

export const UAE_FORMULAS: Record<string, (ctx: PresetFormulaCtx) => Decimal> = {};
