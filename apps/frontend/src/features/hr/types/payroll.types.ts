import type { PaginationParams } from "@/types/common/pagination.types";

export type PayrollRunStatus =
  "DRAFT" | "PROCESSING" | "REVIEW" | "APPROVED" | "PAID" | "CANCELLED" | "FAILED";
export type PayslipStatus = "DRAFT" | "FINALIZED" | "VOIDED";
export type SalaryComponentType =
  | "EARNING"
  | "DEDUCTION"
  | "STATUTORY_DEDUCTION"
  | "EMPLOYER_CONTRIBUTION"
  | "REIMBURSEMENT"
  | "ADJUSTMENT";
export type ComponentCalcMethod =
  "FIXED" | "PERCENT_OF_BASIC" | "PERCENT_OF_GROSS" | "FORMULA" | "ATTENDANCE_DERIVED";
export type PayCycle = "MONTHLY" | "BIWEEKLY" | "WEEKLY";
export type SalaryAdvanceStatus =
  "PENDING" | "APPROVED" | "DISBURSED" | "RECOVERING" | "SETTLED" | "REJECTED" | "CANCELLED";

export interface SalaryStructure {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  countryCode: string | null;
  isActive: boolean;
  components?: SalaryComponent[];
  createdAt: string;
  updatedAt: string;
}

export interface SalaryComponent {
  id: string;
  tenantId: string;
  salaryStructureId: string;
  name: string;
  code: string;
  type: SalaryComponentType;
  calcMethod: ComponentCalcMethod;
  fixedAmount: string | null;
  percentValue: string | null;
  formulaKey: string | null;
  isTaxable: boolean;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Lightweight employee identity the payroll list/detail endpoints embed. */
export interface PayrollEmployeeSummary {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
}

export interface EmployeeSalary {
  id: string;
  tenantId: string;
  employeeId: string;
  employee?: PayrollEmployeeSummary;
  salaryStructureId: string;
  salaryStructure?: Pick<SalaryStructure, "id" | "name" | "code">;
  basicPay: string;
  ctc: string | null;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  supersededById: string | null;
  createdAt: string;
}

export interface PayrollRun {
  id: string;
  tenantId: string;
  name: string;
  periodStart: string;
  periodEnd: string;
  payCycle: PayCycle;
  status: PayrollRunStatus;
  storeId: string | null;
  processedById: string | null;
  reviewedById: string | null;
  approvedById: string | null;
  processedAt: string | null;
  reviewedAt: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface PayslipLine {
  id: string;
  payslipId: string;
  componentCode: string;
  componentName: string;
  type: SalaryComponentType;
  calcMethod: ComponentCalcMethod;
  amount: string;
  meta: Record<string, unknown> | null;
}

export interface Payslip {
  id: string;
  tenantId: string;
  payrollRunId: string;
  employeeId: string;
  employee?: PayrollEmployeeSummary;
  employeeSalaryId: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  grossPay: string;
  totalDeductions: string;
  netPay: string;
  daysWorked: string;
  daysAbsent: string;
  overtimeHours: string;
  status: PayslipStatus;
  flags: string[];
  finalizedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  reversesPayslipId: string | null;
  createdAt: string;
  lines?: PayslipLine[];
}

export interface SalaryAdvance {
  id: string;
  tenantId: string;
  employeeId: string;
  employee?: PayrollEmployeeSummary;
  amount: string;
  currency: string;
  reason: string | null;
  installments: number;
  amountPerInstallment: string;
  status: SalaryAdvanceStatus;
  approvedById: string | null;
  disbursedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PresetResult {
  disclaimer: string;
  components: Omit<
    SalaryComponent,
    "id" | "tenantId" | "salaryStructureId" | "createdAt" | "updatedAt"
  >[];
}

// List params
export interface SalaryStructureListParams extends PaginationParams {
  search?: string;
  isActive?: boolean;
}

export interface EmployeeSalaryListParams extends PaginationParams {
  employeeId?: string;
}

export interface PayrollRunListParams extends PaginationParams {
  status?: PayrollRunStatus;
  storeId?: string;
}

export interface PayslipListParams extends PaginationParams {
  employeeId?: string;
  status?: PayslipStatus;
}

export interface SalaryAdvanceListParams extends PaginationParams {
  employeeId?: string;
  status?: SalaryAdvanceStatus;
}

// Inputs
export interface CreateSalaryStructureInput {
  name: string;
  code: string;
  countryCode?: string | null;
}

export interface UpdateSalaryStructureInput {
  name?: string;
  countryCode?: string | null;
}

export interface CreateSalaryComponentInput {
  name: string;
  code: string;
  type: SalaryComponentType;
  calcMethod: ComponentCalcMethod;
  fixedAmount?: string | null;
  percentValue?: string | null;
  formulaKey?: string | null;
  isTaxable: boolean;
  displayOrder: number;
}

export interface UpdateSalaryComponentInput extends Partial<CreateSalaryComponentInput> {
  isActive?: boolean;
}

export interface AssignEmployeeSalaryInput {
  employeeId: string;
  salaryStructureId: string;
  basicPay: string;
  ctc?: string | null;
  currency: string;
  effectiveFrom: string;
}

export interface CreatePayrollRunInput {
  name: string;
  periodStart: string;
  periodEnd: string;
  payCycle: PayCycle;
  storeId?: string | null;
}

export interface VoidPayslipInput {
  reason: string;
  reversalRunId?: string;
}

export interface CreateSalaryAdvanceInput {
  employeeId: string;
  amount: string;
  currency: string;
  reason?: string;
  installments: number;
}

// ── UI helpers ────────────────────────────────────────────────────────────────
// Status / type → shared Badge variant. Keeps payroll visuals on the design
// system instead of ad-hoc palette colors.
type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "outline";

export const RUN_STATUS_VARIANT: Record<PayrollRunStatus, BadgeVariant> = {
  DRAFT: "default",
  PROCESSING: "info",
  REVIEW: "warning",
  APPROVED: "info",
  PAID: "success",
  CANCELLED: "default",
  FAILED: "danger",
};

export const ADVANCE_STATUS_VARIANT: Record<SalaryAdvanceStatus, BadgeVariant> = {
  PENDING: "warning",
  APPROVED: "info",
  DISBURSED: "info",
  RECOVERING: "info",
  SETTLED: "success",
  REJECTED: "danger",
  CANCELLED: "default",
};

export const COMPONENT_TYPE_VARIANT: Record<SalaryComponentType, BadgeVariant> = {
  EARNING: "success",
  DEDUCTION: "danger",
  STATUTORY_DEDUCTION: "warning",
  EMPLOYER_CONTRIBUTION: "info",
  REIMBURSEMENT: "default",
  ADJUSTMENT: "outline",
};

export const PAYSLIP_FLAGS: Record<string, { label: string; variant: BadgeVariant }> = {
  NEGATIVE_NET_PAY: { label: "Negative net", variant: "danger" },
  NO_SALARY_FOUND: { label: "No salary", variant: "warning" },
  NO_ATTENDANCE_DATA: { label: "No attendance", variant: "warning" },
  ADVANCE_RECOVERY: { label: "Advance deducted", variant: "info" },
};
