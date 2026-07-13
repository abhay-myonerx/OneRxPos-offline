// Bangladesh payroll preset (static, repo-shipped).
// Components: Basic, House Rent (50% of basic), Medical, Conveyance.
// DISCLAIMER: Statutory rates are advisory scaffolding — tenants must
// verify with local legal/tax advisors before finalizing payroll.

import Decimal from "decimal.js";
import type { PresetFormulaCtx } from "./index";

export const BD_COMPONENTS = [
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
    percentValue: new Decimal("50.00"),
    isTaxable: true,
    displayOrder: 20,
  },
  {
    name: "Medical Allowance",
    code: "MEDICAL",
    type: "EARNING" as const,
    calcMethod: "FIXED" as const,
    fixedAmount: new Decimal("1200.0000"),
    isTaxable: false,
    displayOrder: 30,
  },
  {
    name: "Conveyance Allowance",
    code: "CONVEYANCE",
    type: "EARNING" as const,
    calcMethod: "FIXED" as const,
    fixedAmount: new Decimal("500.0000"),
    isTaxable: false,
    displayOrder: 40,
  },
  {
    name: "Provident Fund (Employee)",
    code: "PF_EMP",
    type: "DEDUCTION" as const,
    calcMethod: "PERCENT_OF_BASIC" as const,
    percentValue: new Decimal("10.00"),
    isTaxable: false,
    displayOrder: 100,
  },
  {
    name: "Provident Fund (Employer)",
    code: "PF_EMP_CONTRIB",
    type: "EMPLOYER_CONTRIBUTION" as const,
    calcMethod: "PERCENT_OF_BASIC" as const,
    percentValue: new Decimal("10.00"),
    isTaxable: false,
    displayOrder: 110,
  },
];

export const BD_FORMULAS: Record<string, (ctx: PresetFormulaCtx) => Decimal> = {};
