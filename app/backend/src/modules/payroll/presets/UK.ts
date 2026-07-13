// United Kingdom payroll preset (static, repo-shipped).
// DISCLAIMER: NI / PAYE rates are advisory scaffolding — verify with HMRC.

import Decimal from "decimal.js";
import type { PresetFormulaCtx } from "./index";

export const UK_COMPONENTS = [
  {
    name: "Gross Pay",
    code: "BASIC",
    type: "EARNING" as const,
    calcMethod: "FIXED" as const,
    isTaxable: true,
    displayOrder: 10,
  },
  {
    name: "PAYE Income Tax (est.)",
    code: "PAYE",
    type: "STATUTORY_DEDUCTION" as const,
    calcMethod: "FORMULA" as const,
    formulaKey: "UK_PAYE",
    isTaxable: false,
    displayOrder: 100,
  },
  {
    name: "National Insurance (Employee)",
    code: "NI_EMP",
    type: "STATUTORY_DEDUCTION" as const,
    calcMethod: "PERCENT_OF_GROSS" as const,
    percentValue: new Decimal("12.00"),
    isTaxable: false,
    displayOrder: 110,
  },
  {
    name: "National Insurance (Employer)",
    code: "NI_EMP_CONTRIB",
    type: "EMPLOYER_CONTRIBUTION" as const,
    calcMethod: "PERCENT_OF_GROSS" as const,
    percentValue: new Decimal("13.80"),
    isTaxable: false,
    displayOrder: 200,
  },
];

// 20% basic rate PAYE estimate above personal allowance (£12,570/yr = £1,047.50/mo).
export const UK_FORMULAS: Record<string, (ctx: PresetFormulaCtx) => Decimal> = {
  UK_PAYE: (ctx) => {
    const monthlyAllowance = new Decimal("1047.50");
    const taxable = Decimal.max(ctx.grossPay.minus(monthlyAllowance), 0);
    return taxable.times("0.20").toDecimalPlaces(4);
  },
};
