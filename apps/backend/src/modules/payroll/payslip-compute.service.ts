// Pure, deterministic payslip computation engine.
// §9 of docs/v2/hrm-deep-dives/5.hrm-payroll.md
//
// Rules:
//  - All arithmetic via the v1 money util (decimal.js, ROUND_HALF_EVEN).
//  - No Date.now(), no randomness, no I/O — pure given resolved inputs.
//  - Re-running with identical inputs produces byte-identical drafts.
//  - EMPLOYER_CONTRIBUTION lines are costed (CTC) but NOT subtracted from net.

import Decimal from "decimal.js";

import { m, sum } from "../../shared/utils/money";
import type { PresetFormulaCtx } from "./presets/index";
import { getPreset } from "./presets/index";
import type { ComputePayslipInput, DraftPayslip, DraftPayslipLine } from "./payroll.types";

// Standard working days per month used for daily-rate calculation.
const DEFAULT_STANDARD_DAYS = 26;
const OT_MULTIPLIER = m("1.5"); // 1.5× for overtime — configurable in v2.1

/**
 * Compute a single employee payslip deterministically.
 * Returns a DraftPayslip ready to be persisted.
 */
export function computePayslip(input: ComputePayslipInput): DraftPayslip {
  const {
    employeeId,
    salaryId,
    basicPay: basicPayRaw,
    currency,
    components,
    periodStart,
    periodEnd,
    standardDays,
    countryCode,
    attendance,
    leave,
    nightDiff,
    pendingAdvanceAmount,
    advanceId,
  } = input;

  const basicPay = m(basicPayRaw);
  const stdDays = standardDays > 0 ? standardDays : DEFAULT_STANDARD_DAYS;
  const dailyRate = basicPay.div(stdDays);
  const hourlyRate = dailyRate.div(8); // 8-hour workday assumption

  const flags: string[] = [];
  const lines: DraftPayslipLine[] = [];

  // Track running gross (needed for PERCENT_OF_GROSS components ordered after earnings)
  let runningGross = m(0);

  // Sort components by displayOrder (deterministic)
  const sortedComponents = [...components].sort((a, b) => a.displayOrder - b.displayOrder);

  for (const comp of sortedComponents) {
    if (!comp) continue;

    let amount = m(0);
    const meta: Record<string, unknown> = { calcMethod: comp.calcMethod };

    switch (comp.calcMethod) {
      case "FIXED":
        amount = comp.fixedAmount ? m(comp.fixedAmount) : m(0);
        meta.fixedAmount = amount.toFixed(4);
        break;

      case "PERCENT_OF_BASIC":
        if (comp.percentValue) {
          amount = basicPay.times(m(comp.percentValue)).div(100);
          meta.basis = "PERCENT_OF_BASIC";
          meta.rate = m(comp.percentValue).toNumber();
        }
        break;

      case "PERCENT_OF_GROSS":
        if (comp.percentValue) {
          amount = runningGross.times(m(comp.percentValue)).div(100);
          meta.basis = "PERCENT_OF_GROSS";
          meta.rate = m(comp.percentValue).toNumber();
        }
        break;

      case "FORMULA": {
        if (!comp.formulaKey || !countryCode) {
          flags.push(`FORMULA_MISSING:${comp.code}`);
          break;
        }
        const preset = getPreset(countryCode);
        if (!preset) {
          flags.push(`PRESET_NOT_FOUND:${countryCode}`);
          break;
        }
        const fn = preset.formulas[comp.formulaKey];
        if (!fn) {
          flags.push(`FORMULA_KEY_NOT_FOUND:${comp.formulaKey}`);
          break;
        }
        const ctx: PresetFormulaCtx = {
          grossPay: runningGross,
          basicPay,
          daysWorked: m(attendance.daysWorked),
          standardDays: stdDays,
          currency,
        };
        amount = fn(ctx).toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN);
        meta.formulaKey = comp.formulaKey;
        meta.preset = countryCode;
        break;
      }

      case "ATTENDANCE_DERIVED":
        if (comp.code === "OVERTIME") {
          // Overtime earning
          const otHours = m(attendance.overtimeMinutes).div(60);
          amount = otHours.times(hourlyRate).times(OT_MULTIPLIER);
          meta.otHours = otHours.toFixed(2);
          meta.hourlyRate = hourlyRate.toFixed(4);
          meta.otMultiplier = OT_MULTIPLIER.toFixed(2);
        } else if (comp.code === "LWP") {
          // Loss of pay for unpaid leave days
          amount = dailyRate.times(m(leave.unpaidDays));
          meta.unpaidDays = leave.unpaidDays;
          meta.dailyRate = dailyRate.toFixed(4);
        } else if (comp.code === "ABSENCE") {
          // Absence deduction for unexcused absent days
          amount = dailyRate.times(m(attendance.unpaidAbsentDays));
          meta.absentDays = attendance.unpaidAbsentDays;
          meta.dailyRate = dailyRate.toFixed(4);
        } else if (comp.code === "NIGHT_DIFF") {
          // Night differential
          if (nightDiff && nightDiff.nightDifferentialPct > 0) {
            const ndHours = m(nightDiff.nightHours);
            const ndRate = hourlyRate.times(m(nightDiff.nightDifferentialPct)).div(100);
            amount = ndHours.times(ndRate);
            meta.nightHours = nightDiff.nightHours;
            meta.pct = nightDiff.nightDifferentialPct;
          }
        } else {
          flags.push(`ATTENDANCE_DERIVED_UNKNOWN:${comp.code}`);
        }
        break;

      default:
        flags.push(`UNKNOWN_CALC_METHOD:${comp.code}`);
        break;
    }

    // Round to 4dp (Decimal(12,4) money precision)
    amount = amount.toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN);

    const type = comp.type as DraftPayslipLine["type"];
    lines.push({
      componentCode: comp.code,
      label: comp.name,
      type,
      amount,
      isTaxable: comp.isTaxable,
      displayOrder: comp.displayOrder,
      meta,
    });

    // Accumulate running gross from EARNING lines only
    if (type === "EARNING" || type === "REIMBURSEMENT") {
      runningGross = runningGross.plus(amount);
    }
  }

  // Advance recovery line
  if (pendingAdvanceAmount.gt(0)) {
    lines.push({
      componentCode: "ADVANCE_RECOVERY",
      label: "Salary Advance Recovery",
      type: "DEDUCTION",
      amount: pendingAdvanceAmount.toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN),
      isTaxable: false,
      displayOrder: 900,
      meta: { advanceId },
    });
  }

  // Night differential (if not already handled via component)
  if (nightDiff && nightDiff.nightDifferentialPct > 0) {
    const hasNdComp = lines.some((l) => l.componentCode === "NIGHT_DIFF");
    if (!hasNdComp) {
      const ndHours = m(nightDiff.nightHours);
      const ndRate = hourlyRate.times(m(nightDiff.nightDifferentialPct)).div(100);
      const ndAmount = ndHours.times(ndRate).toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN);
      if (ndAmount.gt(0)) {
        lines.push({
          componentCode: "NIGHT_DIFF",
          label: "Night Shift Differential",
          type: "EARNING",
          amount: ndAmount,
          isTaxable: true,
          displayOrder: 80,
          meta: { nightHours: nightDiff.nightHours, pct: nightDiff.nightDifferentialPct },
        });
      }
    }
  }

  // Bucket totals
  const earningTotal = sum(
    lines.filter((l) => l.type === "EARNING" || l.type === "REIMBURSEMENT").map((l) => l.amount),
  );

  const deductionTotal = sum(
    lines
      .filter(
        (l) =>
          l.type === "DEDUCTION" || l.type === "STATUTORY_DEDUCTION" || l.type === "ADJUSTMENT",
      )
      .map((l) => l.amount),
  );

  const grossPay = earningTotal.toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN);
  const totalDeductions = deductionTotal.toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN);
  const netPay = grossPay.minus(totalDeductions).toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN);

  if (netPay.lt(0)) {
    flags.push("NEGATIVE_NET_PAY");
    // Do NOT clamp to zero by default; flag and let human review (§13 business rule)
  }

  return {
    employeeId,
    employeeSalaryId: salaryId,
    periodStart,
    periodEnd,
    currency,
    grossPay,
    totalDeductions,
    netPay,
    daysWorked: m(attendance.daysWorked).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN),
    daysAbsent: m(attendance.daysAbsent).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN),
    overtimeHours: m(attendance.overtimeMinutes)
      .div(60)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN),
    lines,
    flags,
  };
}

/**
 * Derive attendance facts for a given employee over a period from
 * the existing attendance records in the database.
 * Returns a best-effort AttendanceFacts struct; flags if data is missing.
 */
export function deriveAttendanceFacts(
  records: Array<{
    workedMinutes?: number | null;
    overtimeMinutes?: number | null;
    lateMinutes?: number | null;
    date: Date;
    status: string;
  }>,
  _periodStart: Date,
  _periodEnd: Date,
): { facts: import("./payroll.types").AttendanceFacts; flags: string[] } {
  const flags: string[] = [];

  if (records.length === 0) {
    flags.push("NO_ATTENDANCE_DATA");
  }

  let daysWorked = 0;
  let daysAbsent = 0;
  let lateMinutes = 0;
  let overtimeMinutes = 0;
  let unpaidAbsentDays = 0;

  for (const r of records) {
    if (r.status === "PRESENT" || r.status === "HALF_DAY") {
      daysWorked += r.status === "HALF_DAY" ? 0.5 : 1;
    } else if (r.status === "ABSENT") {
      daysAbsent += 1;
      unpaidAbsentDays += 1;
    } else if (r.status === "ON_LEAVE") {
      daysAbsent += 1;
      // on-leave: do NOT count as unpaid absent (leave module handles paid/unpaid)
    }
    lateMinutes += r.lateMinutes ?? 0;
    overtimeMinutes += r.overtimeMinutes ?? 0;
  }

  return {
    facts: {
      daysWorked,
      daysAbsent,
      lateMinutes,
      overtimeMinutes,
      unpaidAbsentDays,
    },
    flags,
  };
}
