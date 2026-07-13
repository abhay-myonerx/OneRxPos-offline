// Unit tests for the payslip computation engine // Pure functions — no database required.
//
// Coverage:
//   * FIXED component produces correct amount
//   * PERCENT_OF_BASIC produces basic * rate / 100
//   * PERCENT_OF_GROSS uses running gross at component position
//   * FORMULA component invokes preset pure function
//   * ATTENDANCE_DERIVED overtime earning
//   * ATTENDANCE_DERIVED LWP deduction
//   * Decimal precision: no JS float rounding errors
//   * Re-processing with same inputs → identical result (determinism)
//   * NEGATIVE_NET_PAY flagged, not silently clamped
//   * Advance recovery produces a DEDUCTION line
//   * Missing attendance data flagged

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { m } from "../../../shared/utils/money";
import { computePayslip, deriveAttendanceFacts } from "../payslip-compute.service";
import type { ComputePayslipInput } from "../payroll.types";

const PERIOD_START = new Date("2026-05-01");
const PERIOD_END = new Date("2026-05-31");

function baseInput(overrides: Partial<ComputePayslipInput> = {}): ComputePayslipInput {
  return {
    employeeId: "emp-1",
    salaryId: "sal-1",
    basicPay: m("50000"),
    ctc: null,
    currency: "BDT",
    structureId: "struct-1",
    components: [
      {
        code: "BASIC",
        name: "Basic",
        type: "EARNING",
        calcMethod: "FIXED",
        fixedAmount: m("50000"),
        percentValue: null,
        formulaKey: null,
        isTaxable: true,
        displayOrder: 10,
      },
    ],
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    standardDays: 26,
    countryCode: null,
    attendance: {
      daysWorked: 26,
      daysAbsent: 0,
      lateMinutes: 0,
      overtimeMinutes: 0,
      unpaidAbsentDays: 0,
    },
    leave: { paidDays: 0, unpaidDays: 0 },
    nightDiff: null,
    pendingAdvanceAmount: m(0),
    advanceId: null,
    ...overrides,
  };
}

describe("computePayslip", () => {
  it("FIXED component: amount equals fixedAmount", () => {
    const draft = computePayslip(baseInput());
    const basicLine = draft.lines.find((l) => l.componentCode === "BASIC");
    expect(basicLine).toBeDefined();
    expect(basicLine!.amount.toFixed(4)).toBe("50000.0000");
    expect(draft.grossPay.toFixed(4)).toBe("50000.0000");
    expect(draft.netPay.toFixed(4)).toBe("50000.0000");
  });

  it("PERCENT_OF_BASIC: HRA 50% of basic = 25000", () => {
    const input = baseInput({
      components: [
        {
          code: "BASIC",
          name: "Basic",
          type: "EARNING",
          calcMethod: "FIXED",
          fixedAmount: m("50000"),
          percentValue: null,
          formulaKey: null,
          isTaxable: true,
          displayOrder: 10,
        },
        {
          code: "HRA",
          name: "House Rent",
          type: "EARNING",
          calcMethod: "PERCENT_OF_BASIC",
          fixedAmount: null,
          percentValue: m("50"),
          formulaKey: null,
          isTaxable: true,
          displayOrder: 20,
        },
      ],
    });
    const draft = computePayslip(input);
    const hraLine = draft.lines.find((l) => l.componentCode === "HRA");
    expect(hraLine!.amount.toFixed(4)).toBe("25000.0000");
    expect(draft.grossPay.toFixed(4)).toBe("75000.0000");
  });

  it("PERCENT_OF_GROSS: applies to running gross AFTER earnings", () => {
    const input = baseInput({
      components: [
        {
          code: "BASIC",
          name: "Basic",
          type: "EARNING",
          calcMethod: "FIXED",
          fixedAmount: m("50000"),
          percentValue: null,
          formulaKey: null,
          isTaxable: true,
          displayOrder: 10,
        },
        {
          code: "HRA",
          name: "HRA",
          type: "EARNING",
          calcMethod: "PERCENT_OF_BASIC",
          fixedAmount: null,
          percentValue: m("40"),
          formulaKey: null,
          isTaxable: true,
          displayOrder: 20,
        },
        {
          code: "TAX",
          name: "Tax",
          type: "DEDUCTION",
          calcMethod: "PERCENT_OF_GROSS",
          fixedAmount: null,
          percentValue: m("10"),
          formulaKey: null,
          isTaxable: false,
          displayOrder: 100,
        },
      ],
    });
    const draft = computePayslip(input);
    const taxLine = draft.lines.find((l) => l.componentCode === "TAX");
    // Running gross at position 100 = 50000 + 20000 = 70000; 10% = 7000
    expect(taxLine!.amount.toFixed(4)).toBe("7000.0000");
    expect(draft.totalDeductions.toFixed(4)).toBe("7000.0000");
    expect(draft.netPay.toFixed(4)).toBe("63000.0000");
  });

  it("FORMULA: uses preset pure function", () => {
    const input = baseInput({
      countryCode: "US",
      components: [
        {
          code: "BASIC",
          name: "Base Salary",
          type: "EARNING",
          calcMethod: "FIXED",
          fixedAmount: m("10000"),
          percentValue: null,
          formulaKey: null,
          isTaxable: true,
          displayOrder: 10,
        },
        {
          code: "FIT",
          name: "Federal Income Tax",
          type: "STATUTORY_DEDUCTION",
          calcMethod: "FORMULA",
          fixedAmount: null,
          percentValue: null,
          formulaKey: "US_FIT",
          isTaxable: false,
          displayOrder: 100,
        },
      ],
    });
    const draft = computePayslip(input);
    const fitLine = draft.lines.find((l) => l.componentCode === "FIT");
    // US_FIT = gross * 0.22 = 10000 * 0.22 = 2200
    expect(fitLine!.amount.toFixed(4)).toBe("2200.0000");
  });

  it("ATTENDANCE_DERIVED overtime: overtimeHours * hourlyRate * 1.5", () => {
    const basicPay = m("52000");
    const standardDays = 26;
    const dailyRate = basicPay.div(standardDays);
    const hourlyRate = dailyRate.div(8);
    const expectedOt = hourlyRate.times("1.5").times(8).toDecimalPlaces(4);

    const input = baseInput({
      basicPay,
      standardDays,
      attendance: {
        daysWorked: 26,
        daysAbsent: 0,
        lateMinutes: 0,
        overtimeMinutes: 480, // 8 hours
        unpaidAbsentDays: 0,
      },
      components: [
        {
          code: "BASIC",
          name: "Basic",
          type: "EARNING",
          calcMethod: "FIXED",
          fixedAmount: basicPay,
          percentValue: null,
          formulaKey: null,
          isTaxable: true,
          displayOrder: 10,
        },
        {
          code: "OVERTIME",
          name: "Overtime",
          type: "EARNING",
          calcMethod: "ATTENDANCE_DERIVED",
          fixedAmount: null,
          percentValue: null,
          formulaKey: null,
          isTaxable: true,
          displayOrder: 50,
        },
      ],
    });
    const draft = computePayslip(input);
    const otLine = draft.lines.find((l) => l.componentCode === "OVERTIME");
    expect(otLine!.amount.toFixed(4)).toBe(expectedOt.toFixed(4));
  });

  it("ATTENDANCE_DERIVED LWP: unpaid days dock pay", () => {
    const basicPay = m("26000");
    const standardDays = 26;
    const dailyRate = basicPay.div(standardDays); // 1000/day
    const unpaidDays = 2;
    const expectedLwp = dailyRate.times(unpaidDays).toDecimalPlaces(4);

    const input = baseInput({
      basicPay,
      standardDays,
      leave: { paidDays: 0, unpaidDays },
      components: [
        {
          code: "BASIC",
          name: "Basic",
          type: "EARNING",
          calcMethod: "FIXED",
          fixedAmount: basicPay,
          percentValue: null,
          formulaKey: null,
          isTaxable: true,
          displayOrder: 10,
        },
        {
          code: "LWP",
          name: "Loss of Pay",
          type: "DEDUCTION",
          calcMethod: "ATTENDANCE_DERIVED",
          fixedAmount: null,
          percentValue: null,
          formulaKey: null,
          isTaxable: false,
          displayOrder: 100,
        },
      ],
    });
    const draft = computePayslip(input);
    const lwpLine = draft.lines.find((l) => l.componentCode === "LWP");
    expect(lwpLine!.amount.toFixed(4)).toBe(expectedLwp.toFixed(4));
  });

  it("Decimal precision: no floating-point rounding error", () => {
    // 1/3 * 3 should be exactly 1 with Decimal, not 0.9999...
    const input = baseInput({
      basicPay: m("1"),
      components: [
        {
          code: "BASIC",
          name: "Basic",
          type: "EARNING",
          calcMethod: "PERCENT_OF_BASIC",
          fixedAmount: null,
          percentValue: new Decimal("33.3333"),
          formulaKey: null,
          isTaxable: true,
          displayOrder: 10,
        },
      ],
    });
    const draft = computePayslip(input);
    const line = draft.lines.find((l) => l.componentCode === "BASIC");
    // 1 * 33.3333 / 100 = 0.333333 → rounded to 4dp = 0.3333
    expect(line!.amount.toString()).toBe("0.3333");
  });

  it("Determinism: re-processing with same inputs produces identical payslip", () => {
    const input = baseInput();
    const draft1 = computePayslip(input);
    const draft2 = computePayslip(input);
    expect(draft1.grossPay.toFixed(4)).toBe(draft2.grossPay.toFixed(4));
    expect(draft1.netPay.toFixed(4)).toBe(draft2.netPay.toFixed(4));
    expect(draft1.lines.length).toBe(draft2.lines.length);
    draft1.lines.forEach((l, i) => {
      expect(l.amount.toFixed(4)).toBe(draft2.lines[i].amount.toFixed(4));
    });
  });

  it("NEGATIVE_NET_PAY: flagged, not silently clamped to zero", () => {
    const input = baseInput({
      components: [
        {
          code: "BASIC",
          name: "Basic",
          type: "EARNING",
          calcMethod: "FIXED",
          fixedAmount: m("1000"),
          percentValue: null,
          formulaKey: null,
          isTaxable: true,
          displayOrder: 10,
        },
        {
          code: "DEDUCT",
          name: "Big Deduction",
          type: "DEDUCTION",
          calcMethod: "FIXED",
          fixedAmount: m("5000"),
          percentValue: null,
          formulaKey: null,
          isTaxable: false,
          displayOrder: 100,
        },
      ],
    });
    const draft = computePayslip(input);
    expect(draft.netPay.lt(0)).toBe(true);
    expect(draft.flags).toContain("NEGATIVE_NET_PAY");
  });

  it("Advance recovery: produces a DEDUCTION line", () => {
    const input = baseInput({
      pendingAdvanceAmount: m("2000"),
      advanceId: "adv-1",
    });
    const draft = computePayslip(input);
    const advLine = draft.lines.find((l) => l.componentCode === "ADVANCE_RECOVERY");
    expect(advLine).toBeDefined();
    expect(advLine!.type).toBe("DEDUCTION");
    expect(advLine!.amount.toFixed(4)).toBe("2000.0000");
  });
});

describe("deriveAttendanceFacts", () => {
  it("flags NO_ATTENDANCE_DATA when no records", () => {
    const { facts, flags } = deriveAttendanceFacts([], PERIOD_START, PERIOD_END);
    expect(flags).toContain("NO_ATTENDANCE_DATA");
    expect(facts.daysWorked).toBe(0);
  });

  it("counts PRESENT days and ABSENT days correctly", () => {
    const records = [
      {
        date: new Date("2026-05-01"),
        status: "PRESENT",
        workedMinutes: 480,
        overtimeMinutes: 0,
        lateMinutes: 0,
      },
      {
        date: new Date("2026-05-02"),
        status: "ABSENT",
        workedMinutes: 0,
        overtimeMinutes: 0,
        lateMinutes: 0,
      },
      {
        date: new Date("2026-05-03"),
        status: "HALF_DAY",
        workedMinutes: 240,
        overtimeMinutes: 0,
        lateMinutes: 0,
      },
    ];
    const { facts } = deriveAttendanceFacts(records, PERIOD_START, PERIOD_END);
    expect(facts.daysWorked).toBe(1.5);
    expect(facts.daysAbsent).toBe(1);
    expect(facts.unpaidAbsentDays).toBe(1);
  });

  it("ON_LEAVE does not count as unpaid absent", () => {
    const records = [
      {
        date: new Date("2026-05-01"),
        status: "ON_LEAVE",
        workedMinutes: 0,
        overtimeMinutes: 0,
        lateMinutes: 0,
      },
    ];
    const { facts } = deriveAttendanceFacts(records, PERIOD_START, PERIOD_END);
    expect(facts.unpaidAbsentDays).toBe(0);
    expect(facts.daysAbsent).toBe(1);
  });
});
