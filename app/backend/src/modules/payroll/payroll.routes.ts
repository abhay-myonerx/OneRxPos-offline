import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { tenantContext } from "../../middleware/tenantContext";
import { validate } from "../../middleware/validate";
import { requireAnyPermission, requirePermission } from "../../middleware/requirePermission";
import { moduleEnabled } from "../../middleware/moduleEnabled";
import { MODULE } from "../../shared/settings/enabledModules";
import { PERMISSIONS_V2 } from "../../shared/permissions/v2-permissions";

import * as controller from "./payroll.controller";
import {
  applyPresetSchema,
  employeeSalaryAssignSchema,
  employeeSalaryListQuerySchema,
  idCidParamSchema,
  idParamSchema,
  payrollRunCancelSchema,
  payrollRunCreateSchema,
  payrollRunListQuerySchema,
  payslipListQuerySchema,
  payslipVoidSchema,
  salaryAdvanceCreateSchema,
  salaryAdvanceListQuerySchema,
  salaryComponentCreateSchema,
  salaryComponentUpdateSchema,
  salaryStructureCreateSchema,
  salaryStructureListQuerySchema,
  salaryStructureUpdateSchema,
} from "./payroll.validation";

const router = Router();

router.use(authenticate, tenantContext, moduleEnabled(MODULE.HR_PAYROLL));

// ─── Country Presets ───────────────────────────────────────────────────────────

router.get(
  "/country-presets",
  requireAnyPermission(
    PERMISSIONS_V2.HR_PAYROLL_COUNTRY_PRESET_READ,
    PERMISSIONS_V2.HR_PAYROLL_SALARY_STRUCTURE_MANAGE,
  ),
  controller.listCountryPresets,
);

// ─── Salary Structures ─────────────────────────────────────────────────────────

router.get(
  "/salary-structures",
  requireAnyPermission(
    PERMISSIONS_V2.HR_PAYROLL_SALARY_STRUCTURE_READ,
    PERMISSIONS_V2.HR_PAYROLL_SALARY_STRUCTURE_MANAGE,
  ),
  validate(salaryStructureListQuerySchema, "query"),
  controller.listSalaryStructures,
);

router.post(
  "/salary-structures",
  requirePermission(PERMISSIONS_V2.HR_PAYROLL_SALARY_STRUCTURE_MANAGE),
  validate(salaryStructureCreateSchema, "body"),
  controller.createSalaryStructure,
);

router.get(
  "/salary-structures/:id",
  requireAnyPermission(
    PERMISSIONS_V2.HR_PAYROLL_SALARY_STRUCTURE_READ,
    PERMISSIONS_V2.HR_PAYROLL_SALARY_STRUCTURE_MANAGE,
  ),
  validate(idParamSchema, "params"),
  controller.getSalaryStructure,
);

router.patch(
  "/salary-structures/:id",
  requirePermission(PERMISSIONS_V2.HR_PAYROLL_SALARY_STRUCTURE_MANAGE),
  validate(idParamSchema, "params"),
  validate(salaryStructureUpdateSchema, "body"),
  controller.updateSalaryStructure,
);

router.delete(
  "/salary-structures/:id",
  requirePermission(PERMISSIONS_V2.HR_PAYROLL_SALARY_STRUCTURE_MANAGE),
  validate(idParamSchema, "params"),
  controller.deactivateSalaryStructure,
);

// Apply country preset to a structure
router.post(
  "/salary-structures/:id/apply-preset",
  requirePermission(PERMISSIONS_V2.HR_PAYROLL_COUNTRY_PRESET_APPLY),
  validate(idParamSchema, "params"),
  validate(applyPresetSchema, "body"),
  controller.applyCountryPreset,
);

// ─── Salary Components ─────────────────────────────────────────────────────────

router.post(
  "/salary-structures/:id/components",
  requirePermission(PERMISSIONS_V2.HR_PAYROLL_SALARY_STRUCTURE_MANAGE),
  validate(idParamSchema, "params"),
  validate(salaryComponentCreateSchema, "body"),
  controller.createSalaryComponent,
);

router.patch(
  "/salary-structures/:id/components/:cid",
  requirePermission(PERMISSIONS_V2.HR_PAYROLL_SALARY_STRUCTURE_MANAGE),
  validate(idCidParamSchema, "params"),
  validate(salaryComponentUpdateSchema, "body"),
  controller.updateSalaryComponent,
);

router.delete(
  "/salary-structures/:id/components/:cid",
  requirePermission(PERMISSIONS_V2.HR_PAYROLL_SALARY_STRUCTURE_MANAGE),
  validate(idCidParamSchema, "params"),
  controller.deactivateSalaryComponent,
);

// ─── Employee Salary Assignment ────────────────────────────────────────────────

router.get(
  "/employee-salaries",
  requireAnyPermission(
    PERMISSIONS_V2.HR_PAYROLL_SALARY_STRUCTURE_READ,
    PERMISSIONS_V2.HR_PAYROLL_SALARY_STRUCTURE_MANAGE,
  ),
  validate(employeeSalaryListQuerySchema, "query"),
  controller.listEmployeeSalaries,
);

router.post(
  "/employee-salaries",
  requirePermission(PERMISSIONS_V2.HR_PAYROLL_SALARY_STRUCTURE_MANAGE),
  validate(employeeSalaryAssignSchema, "body"),
  controller.assignEmployeeSalary,
);

// ─── Payroll Runs ──────────────────────────────────────────────────────────────

router.get(
  "/runs",
  requirePermission(PERMISSIONS_V2.HR_PAYROLL_READ),
  validate(payrollRunListQuerySchema, "query"),
  controller.listPayrollRuns,
);

router.post(
  "/runs",
  requirePermission(PERMISSIONS_V2.HR_PAYROLL_RUN_CREATE),
  validate(payrollRunCreateSchema, "body"),
  controller.createPayrollRun,
);

router.get(
  "/runs/:id",
  requirePermission(PERMISSIONS_V2.HR_PAYROLL_READ),
  validate(idParamSchema, "params"),
  controller.getPayrollRun,
);

router.post(
  "/runs/:id/process",
  requirePermission(PERMISSIONS_V2.HR_PAYROLL_RUN_PROCESS),
  validate(idParamSchema, "params"),
  controller.processPayrollRun,
);

router.post(
  "/runs/:id/approve",
  requirePermission(PERMISSIONS_V2.HR_PAYROLL_RUN_APPROVE),
  validate(idParamSchema, "params"),
  controller.approvePayrollRun,
);

router.post(
  "/runs/:id/disburse",
  requirePermission(PERMISSIONS_V2.HR_PAYROLL_RUN_DISBURSE),
  validate(idParamSchema, "params"),
  controller.disbursePayrollRun,
);

router.post(
  "/runs/:id/cancel",
  requirePermission(PERMISSIONS_V2.HR_PAYROLL_RUN_CANCEL),
  validate(idParamSchema, "params"),
  validate(payrollRunCancelSchema, "body"),
  controller.cancelPayrollRun,
);

// ─── Payslips (admin view) ─────────────────────────────────────────────────────

router.get(
  "/runs/:id/payslips",
  requirePermission(PERMISSIONS_V2.HR_PAYROLL_READ_PAYSLIP_ALL),
  validate(idParamSchema, "params"),
  validate(payslipListQuerySchema, "query"),
  controller.listRunPayslips,
);

router.get(
  "/payslips/:id",
  requirePermission(PERMISSIONS_V2.HR_PAYROLL_READ_PAYSLIP_ALL),
  validate(idParamSchema, "params"),
  controller.getPayslip,
);

// Printable HTML view of a payslip. Browser
// converts to PDF via the print dialog. Same permission gate as
// the JSON detail.
router.get(
  "/payslips/:id/pdf",
  requirePermission(PERMISSIONS_V2.HR_PAYROLL_READ_PAYSLIP_ALL),
  validate(idParamSchema, "params"),
  controller.getPayslipHtml,
);

router.post(
  "/payslips/:id/void",
  requirePermission(PERMISSIONS_V2.HR_PAYROLL_PAYSLIP_VOID),
  validate(idParamSchema, "params"),
  validate(payslipVoidSchema, "body"),
  controller.voidPayslip,
);

// ─── ESS: Employee own payslips ────────────────────────────────────────────────
// Canonical mount lives in `src/modules/ess/ess.routes.ts` at `/api/v2/me/*`
// per API Reference §28.14. The previously-exposed paths
// `/api/v2/hr/payroll/me/payslips{,/:id}` are not in the API Reference
// and not consumed by the frontend; removed to avoid duplicate-surface
// confusion (API_CONTRACT_AUDIT.md §5 / ACI-009). `controller.listOwnPayslips`
// and `controller.getOwnPayslip` remain exported and are reachable via
// the canonical ESS router.

// ─── Salary Advances ───────────────────────────────────────────────────────────

router.get(
  "/advances",
  requireAnyPermission(
    PERMISSIONS_V2.HR_PAYROLL_ADVANCE_READ,
    PERMISSIONS_V2.HR_PAYROLL_ADVANCE_CREATE,
  ),
  validate(salaryAdvanceListQuerySchema, "query"),
  controller.listSalaryAdvances,
);

router.post(
  "/advances",
  requirePermission(PERMISSIONS_V2.HR_PAYROLL_ADVANCE_CREATE),
  validate(salaryAdvanceCreateSchema, "body"),
  controller.createSalaryAdvance,
);

router.get(
  "/advances/:id",
  requireAnyPermission(
    PERMISSIONS_V2.HR_PAYROLL_ADVANCE_READ,
    PERMISSIONS_V2.HR_PAYROLL_ADVANCE_CREATE,
  ),
  validate(idParamSchema, "params"),
  controller.getSalaryAdvance,
);

router.post(
  "/advances/:id/approve",
  requirePermission(PERMISSIONS_V2.HR_PAYROLL_ADVANCE_APPROVE),
  validate(idParamSchema, "params"),
  controller.approveSalaryAdvance,
);

router.post(
  "/advances/:id/reject",
  requirePermission(PERMISSIONS_V2.HR_PAYROLL_ADVANCE_APPROVE),
  validate(idParamSchema, "params"),
  controller.rejectSalaryAdvance,
);

router.post(
  "/advances/:id/disburse",
  requirePermission(PERMISSIONS_V2.HR_PAYROLL_ADVANCE_DISBURSE),
  validate(idParamSchema, "params"),
  controller.disburseSalaryAdvance,
);

router.delete(
  "/advances/:id",
  requirePermission(PERMISSIONS_V2.HR_PAYROLL_ADVANCE_CREATE),
  validate(idParamSchema, "params"),
  controller.cancelSalaryAdvance,
);

export default router;
