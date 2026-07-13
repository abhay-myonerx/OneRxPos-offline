// Types, frozen contracts, and actor interfaces for the payroll module.

import type Decimal from "decimal.js";

// ─── Actor ─────────────────────────────────────────────────────────────────────

export interface PayrollActor {
  id: string;
  tenantId: string;
  role: string;
  employeeId?: string | null;
}

// ─── Payslip computation ───────────────────────────────────────────────────────

export interface AttendanceFacts {
  daysWorked: number;
  daysAbsent: number;
  lateMinutes: number;
  overtimeMinutes: number;
  /** Absent days where no approved leave covers the absence */
  unpaidAbsentDays: number;
}

export interface LeaveFacts {
  paidDays: number;
  unpaidDays: number;
}

export interface NightDiffFact {
  /** Percentage differential (e.g. 25 = +25% of basic for night-shift hours) */
  nightDifferentialPct: number;
  /** Night-shift hours worked */
  nightHours: number;
}

export interface DraftPayslipLine {
  componentCode: string;
  label: string;
  type:
    | "EARNING"
    | "DEDUCTION"
    | "STATUTORY_DEDUCTION"
    | "EMPLOYER_CONTRIBUTION"
    | "REIMBURSEMENT"
    | "ADJUSTMENT";
  amount: Decimal;
  isTaxable: boolean;
  displayOrder: number;
  meta?: Record<string, unknown>;
}

export interface DraftPayslip {
  employeeId: string;
  employeeSalaryId: string;
  periodStart: Date;
  periodEnd: Date;
  currency: string;
  grossPay: Decimal;
  totalDeductions: Decimal;
  netPay: Decimal;
  daysWorked: Decimal;
  daysAbsent: Decimal;
  overtimeHours: Decimal;
  lines: DraftPayslipLine[];
  flags: string[];
}

export interface ComputePayslipInput {
  employeeId: string;
  salaryId: string;
  basicPay: Decimal;
  ctc: Decimal | null;
  currency: string;
  structureId: string;
  components: Array<{
    code: string;
    name: string;
    type: string;
    calcMethod: string;
    fixedAmount: Decimal | null;
    percentValue: Decimal | null;
    formulaKey: string | null;
    isTaxable: boolean;
    displayOrder: number;
  }>;
  periodStart: Date;
  periodEnd: Date;
  standardDays: number;
  countryCode: string | null;
  attendance: AttendanceFacts;
  leave: LeaveFacts;
  nightDiff: NightDiffFact | null;
  pendingAdvanceAmount: Decimal;
  advanceId: string | null;
}

// ─── Payroll run processing summary ───────────────────────────────────────────

export interface RunProcessSummary {
  totalEmployees: number;
  skippedNoSalary: string[];
  skippedNoEmployee: string[];
  flaggedForReview: string[];
  payslipsCreated: number;
}

// ─── ESS contract (frozen) ────────────────────────────────────────────────────

export interface OwnPayslipResult {
  payslipId: string;
  allowed: boolean;
  reason?: string;
}
