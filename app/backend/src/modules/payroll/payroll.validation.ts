// Zod schemas for all payroll module endpoints.
//
// Note: schemas here are NOT wrapped in `z.object({ body: ... })` /
// `z.object({ query: ... })`. An earlier version did, but
// but the `validate(schema, source)` middleware passes
// `req[source]` (e.g. `req.body`) directly — not `{ body: req.body }`.
// That made every payroll route fail with `VALIDATION_ERROR:
// expected object, received undefined` for `field: "body"` /
// `field: "query"`. Unwrapped here to match the rest of the v2
// codebase (employee / attendance / brand / leave) which uses the
// inner shape directly.

import { z } from "zod";

// ─── Shared helpers ────────────────────────────────────────────────────────────

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD");
const positiveDecimalStr = z
  .string()
  .regex(/^\d+(\.\d{1,4})?$/, "Must be a positive decimal with up to 4dp");
const nonNegativeDecimalStr = z
  .string()
  .regex(/^\d+(\.\d{1,4})?$/, "Must be a non-negative decimal with up to 4dp");
const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  sortBy: z.string().optional(),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});

// ─── Salary Structures ─────────────────────────────────────────────────────────

export const salaryStructureCreateSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(50).toUpperCase(),
  countryCode: z.string().length(2).toUpperCase().optional().nullable(),
});
export type SalaryStructureCreateInput = z.infer<typeof salaryStructureCreateSchema>;

export const salaryStructureUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  countryCode: z.string().length(2).toUpperCase().optional().nullable(),
});
export type SalaryStructureUpdateInput = z.infer<typeof salaryStructureUpdateSchema>;

export const salaryStructureListQuerySchema = paginationQuery.extend({
  search: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
});
export type SalaryStructureListInput = z.infer<typeof salaryStructureListQuerySchema>;

// ─── Salary Components ─────────────────────────────────────────────────────────

export const componentTypeEnum = z.enum([
  "EARNING",
  "DEDUCTION",
  "STATUTORY_DEDUCTION",
  "EMPLOYER_CONTRIBUTION",
  "REIMBURSEMENT",
  "ADJUSTMENT",
]);
export const calcMethodEnum = z.enum([
  "FIXED",
  "PERCENT_OF_BASIC",
  "PERCENT_OF_GROSS",
  "FORMULA",
  "ATTENDANCE_DERIVED",
]);

export const salaryComponentCreateSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(50).toUpperCase(),
  type: componentTypeEnum,
  calcMethod: calcMethodEnum,
  fixedAmount: positiveDecimalStr.optional().nullable(),
  percentValue: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .optional()
    .nullable(),
  formulaKey: z.string().max(64).optional().nullable(),
  isTaxable: z.boolean().default(true),
  displayOrder: z.number().int().min(0).default(0),
});
export type SalaryComponentCreateInput = z.infer<typeof salaryComponentCreateSchema>;

export const salaryComponentUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: componentTypeEnum.optional(),
  calcMethod: calcMethodEnum.optional(),
  fixedAmount: positiveDecimalStr.optional().nullable(),
  percentValue: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .optional()
    .nullable(),
  formulaKey: z.string().max(64).optional().nullable(),
  isTaxable: z.boolean().optional(),
  displayOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});
export type SalaryComponentUpdateInput = z.infer<typeof salaryComponentUpdateSchema>;

// ─── Apply preset ──────────────────────────────────────────────────────────────

export const applyPresetSchema = z.object({
  countryCode: z.string().min(2).max(3).toUpperCase(),
});
export type ApplyPresetInput = z.infer<typeof applyPresetSchema>;

// ─── Employee Salary Assignment ────────────────────────────────────────────────

export const employeeSalaryAssignSchema = z.object({
  employeeId: z.string().uuid(),
  salaryStructureId: z.string().uuid(),
  basicPay: positiveDecimalStr,
  ctc: nonNegativeDecimalStr.optional().nullable(),
  currency: z.string().length(3).toUpperCase().default("USD"),
  effectiveFrom: isoDate,
});
export type EmployeeSalaryAssignInput = z.infer<typeof employeeSalaryAssignSchema>;

export const employeeSalaryListQuerySchema = paginationQuery.extend({
  employeeId: z.string().uuid().optional(),
});
export type EmployeeSalaryListInput = z.infer<typeof employeeSalaryListQuerySchema>;

// ─── Payroll Runs ──────────────────────────────────────────────────────────────

export const payrollRunCreateSchema = z
  .object({
    name: z.string().min(1).max(150),
    periodStart: isoDate,
    periodEnd: isoDate,
    payCycle: z.enum(["MONTHLY", "BIWEEKLY", "WEEKLY"]).default("MONTHLY"),
    storeId: z.string().uuid().optional().nullable(),
  })
  .refine((d: { periodStart: string; periodEnd: string }) => d.periodStart <= d.periodEnd, {
    message: "periodStart must be before or equal to periodEnd",
    path: ["periodEnd"],
  });
export type PayrollRunCreateInput = z.infer<typeof payrollRunCreateSchema>;

export const payrollRunListQuerySchema = paginationQuery.extend({
  status: z
    .enum(["DRAFT", "PROCESSING", "REVIEW", "APPROVED", "PAID", "CANCELLED", "FAILED"])
    .optional(),
  storeId: z.string().uuid().optional(),
});
export type PayrollRunListInput = z.infer<typeof payrollRunListQuerySchema>;

export const payrollRunCancelSchema = z.object({
  reason: z.string().min(1).max(500).optional(),
});

// ─── Payslips ──────────────────────────────────────────────────────────────────

export const payslipListQuerySchema = paginationQuery.extend({
  employeeId: z.string().uuid().optional(),
  status: z.enum(["DRAFT", "FINALIZED", "VOIDED"]).optional(),
});
export type PayslipListInput = z.infer<typeof payslipListQuerySchema>;

export const payslipVoidSchema = z.object({
  reason: z.string().min(1).max(500),
  reversalRunId: z.string().uuid().optional(),
});
export type PayslipVoidInput = z.infer<typeof payslipVoidSchema>;

// ─── Salary Advances ───────────────────────────────────────────────────────────

export const salaryAdvanceCreateSchema = z.object({
  employeeId: z.string().uuid(),
  amount: positiveDecimalStr,
  currency: z.string().length(3).toUpperCase().default("USD"),
  reason: z.string().max(1000).optional(),
  installments: z.number().int().min(1).max(60).default(1),
});
export type SalaryAdvanceCreateInput = z.infer<typeof salaryAdvanceCreateSchema>;

export const salaryAdvanceListQuerySchema = paginationQuery.extend({
  employeeId: z.string().uuid().optional(),
  status: z
    .enum(["PENDING", "APPROVED", "DISBURSED", "RECOVERING", "SETTLED", "REJECTED", "CANCELLED"])
    .optional(),
});
export type SalaryAdvanceListInput = z.infer<typeof salaryAdvanceListQuerySchema>;

export const salaryAdvanceDecisionSchema = z.object({
  notes: z.string().max(500).optional(),
});

// ─── Shared param schemas ──────────────────────────────────────────────────────

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export const idCidParamSchema = z.object({
  id: z.string().uuid(),
  cid: z.string().uuid(),
});
