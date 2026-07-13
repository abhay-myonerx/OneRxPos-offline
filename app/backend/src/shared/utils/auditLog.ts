// Shared audit-log helper for v2 modules.
//
// The persistence implementation already lives in
// `src/modules/audit/audit.service.ts` (`writeAuditLog`) — re-exporting
// it through `shared/utils` lets new v2 services depend on the shared
// utility surface rather than reaching into another feature module.
//
// Two ergonomic improvements over calling `writeAuditLog` directly:
//   1. `AuditAction` is a typed string-union of the documented v2
//      verbs (Schema Conventions §8 + RBAC matrix §2.5). Modules
//      add new actions to the union when they ship; the union is
//      narrow on purpose to avoid `"USR_CRTD"`-style drift.
//   2. `recordAudit({ req, ... })` overload pulls `tenantId`, `userId`,
//      and `ipAddress` from `req` so controllers/services don't repeat
//      the wiring. Direct `writeAuditLog` is still exported for code
//      paths that don't have a `req` (jobs, migrations).

import type { Request } from "express";

import { writeAuditLog } from "../../modules/audit/audit.service";

export { writeAuditLog };

// ─── Action vocabulary ─────────────────────────────────────────────────────────
//
// Keep this list sorted alphabetically inside each domain section.
// Adding a new action is a one-line PR; renaming or removing one is
// a breaking change to the audit log consumers (reports, exports).

export type AuditAction =
  // Auth & sessions
  | "USER_LOGGED_IN"
  | "USER_LOGGED_OUT"
  | "USER_LOGIN_FAILED"
  | "USER_PASSWORD_CHANGED"
  | "USER_PASSWORD_RESET"
  // User management
  | "USER_CREATED"
  | "USER_UPDATED"
  | "USER_DEACTIVATED"
  | "USER_REACTIVATED"
  | "USER_ROLE_CHANGED"
  // Tenant & settings
  | "TENANT_UPDATED"
  | "TENANT_SETTINGS_UPDATED"
  | "TENANT_PLAN_CHANGED"
  | "TENANT_STATUS_CHANGED"
  // Stores / branches
  | "STORE_CREATED"
  | "STORE_UPDATED"
  | "STORE_DEACTIVATED"
  | "STORE_REACTIVATED"
  // Catalog — Brand
  | "BRAND_CREATED"
  | "BRAND_UPDATED"
  | "BRAND_DEACTIVATED"
  | "BRAND_REACTIVATED"
  // Pricing — Levy (Phase 1.2 Pricing Brain)
  | "LEVY_CREATED"
  | "LEVY_UPDATED"
  | "LEVY_DEACTIVATED"
  // HRM — Department
  | "DEPARTMENT_CREATED"
  | "DEPARTMENT_UPDATED"
  | "DEPARTMENT_DEACTIVATED"
  | "DEPARTMENT_REACTIVATED"
  // HRM — Designation
  | "DESIGNATION_CREATED"
  | "DESIGNATION_UPDATED"
  | "DESIGNATION_DEACTIVATED"
  | "DESIGNATION_REACTIVATED"
  // HRM — Employee
  | "EMPLOYEE_CREATED"
  | "EMPLOYEE_UPDATED"
  | "EMPLOYEE_DEACTIVATED"
  | "EMPLOYEE_REACTIVATED"
  | "EMPLOYEE_USER_LINKED"
  | "USER_CREATED_VIA_HR"
  | "EMPLOYEE_SENSITIVE_UPDATED"
  | "EMPLOYEE_TERMINATED"
  | "EMPLOYMENT_CONTRACT_CREATED"
  | "EMPLOYEE_DOCUMENT_UPLOADED"
  | "EMPLOYEE_DOCUMENT_DELETED"
  // HRM — Attendance
  | "ATTENDANCE_PUNCH"
  | "ATTENDANCE_CORRECTION_REQUESTED"
  | "ATTENDANCE_CORRECTION_APPROVED"
  | "ATTENDANCE_CORRECTION_REJECTED"
  | "ATTENDANCE_CORRECTION_CANCELLED"
  // HRM — Shifts (WorkShift template)
  | "WORKSHIFT_CREATED"
  | "WORKSHIFT_UPDATED"
  | "WORKSHIFT_DEACTIVATED"
  | "WORKSHIFT_REACTIVATED"
  // HRM — Shifts (ShiftSchedule roster)
  | "SHIFT_SCHEDULE_CREATED"
  | "SHIFT_SCHEDULE_BULK_CREATED"
  | "SHIFT_SCHEDULE_UPDATED"
  | "SHIFT_SCHEDULE_DELETED"
  // HRM — Shifts (Swap workflow)
  | "SHIFT_SWAP_REQUESTED"
  | "SHIFT_SWAP_PEER_ACCEPTED"
  | "SHIFT_SWAP_PEER_REJECTED"
  | "SHIFT_SWAP_APPROVED"
  | "SHIFT_SWAP_REJECTED"
  | "SHIFT_SWAP_CANCELLED"
  // HRM — Leave types
  | "LEAVE_TYPE_CREATED"
  | "LEAVE_TYPE_UPDATED"
  | "LEAVE_TYPE_DEACTIVATED"
  | "LEAVE_TYPE_REACTIVATED"
  // HRM — Leave policies
  | "LEAVE_POLICY_CREATED"
  | "LEAVE_POLICY_UPDATED"
  // HRM — Leave balances
  | "LEAVE_BALANCE_ADJUSTED"
  // HRM — Leave requests
  | "LEAVE_REQUEST_CREATED"
  | "LEAVE_REQUEST_APPROVED"
  | "LEAVE_REQUEST_REJECTED"
  | "LEAVE_REQUEST_CANCELLED"
  // HRM — Holidays
  | "HOLIDAY_CREATED"
  | "HOLIDAY_UPDATED"
  | "HOLIDAY_DEACTIVATED"
  | "HOLIDAY_PRESET_IMPORTED"
  // HRM — Payroll: salary structures & components
  | "SALARY_STRUCTURE_CREATED"
  | "SALARY_STRUCTURE_UPDATED"
  | "SALARY_STRUCTURE_DEACTIVATED"
  | "SALARY_COMPONENT_CREATED"
  | "SALARY_COMPONENT_UPDATED"
  | "SALARY_COMPONENT_DEACTIVATED"
  | "COUNTRY_PRESET_APPLIED"
  // HRM — Payroll: employee salary assignment
  | "EMPLOYEE_SALARY_ASSIGNED"
  // HRM — Payroll: runs
  | "PAYROLL_RUN_CREATED"
  | "PAYROLL_RUN_PROCESSING"
  | "PAYROLL_RUN_REVIEW"
  | "PAYROLL_RUN_APPROVED"
  | "PAYROLL_RUN_PAID"
  | "PAYROLL_RUN_CANCELLED"
  | "PAYROLL_RUN_FAILED"
  // HRM — Payroll: payslips
  | "PAYSLIP_FINALIZED"
  | "PAYSLIP_VOIDED"
  // HRM — Payroll: salary advances
  | "SALARY_ADVANCE_CREATED"
  | "SALARY_ADVANCE_APPROVED"
  | "SALARY_ADVANCE_REJECTED"
  | "SALARY_ADVANCE_DISBURSED"
  | "SALARY_ADVANCE_CANCELLED"
  | "SALARY_ADVANCE_RECOVERED"
  | "SALARY_ADVANCE_SETTLED"
  // POS auth — device enrollment (Phase 1.1)
  | "DEVICE_ENROLLED"
  | "DEVICE_REVOKED"
  // POS auth — PIN set/reset (Phase 1.1)
  | "USER_PIN_SET"
  | "USER_PIN_RESET"
  // POS auth — PIN quick-login (Phase 1.1 Task 8)
  | "PIN_LOGIN_FAILED"
  | "PIN_LOGIN_LOCKED"
  // POS auth — inline-PIN manager override grants (Phase 1.1 Task 9)
  | "POS_OVERRIDE_GRANTED"
  | "POS_OVERRIDE_DENIED"
  | "POS_OVERRIDE_LOCKED"
  // POS auth — override grant consumption for pre-checkout gated actions
  // (void line, clear transaction — Phase 1.3a Task 8)
  | "POS_OVERRIDE_CONSUMED"
  | "POS_OVERRIDE_CONSUME_FAILED";

// Generic fallback — modules MAY use this only when they prefer to
// own the verb in their own union and merge it at the type level.
// Plain strings are intentionally NOT accepted; if you find
// yourself reaching for one, add it to the union above.
// ─── Recorder ──────────────────────────────────────────────────────────────────

export interface RecordAuditFromReqParams {
  req: Request;
  action: AuditAction;
  entityType: string;
  entityId: string;
  oldData?: unknown;
  newData?: unknown;
}

export interface RecordAuditParams {
  tenantId: string;
  userId?: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  oldData?: unknown;
  newData?: unknown;
  ipAddress?: string;
}

/**
 * Write an audit-log entry. Two call shapes:
 *
 *   recordAudit({ req, action, entityType, entityId, ... })
 *     — pulls `tenantId`, `userId`, `ipAddress` from the request.
 *
 *   recordAudit({ tenantId, userId, action, entityType, entityId, ... })
 *     — for jobs / migrations / anywhere without a `req`.
 *
 * Both shapes forward to `writeAuditLog` so the on-wire persistence
 * is a single chokepoint.
 */
export async function recordAudit(
  params: RecordAuditFromReqParams | RecordAuditParams,
): Promise<void> {
  if ("req" in params) {
    const { req, ...rest } = params;
    const tenantId = req.user?.tenantId ?? req.tenantId;
    if (!tenantId) {
      // Audit must never throw and never silently swallow — if we
      // truly lack a tenant context, that's a programming error
      // upstream (auth middleware didn't run). Surface it.
      throw new Error("recordAudit({ req }) requires an authenticated request");
    }
    await writeAuditLog({
      tenantId,
      userId: req.user?.id,
      ipAddress: req.ip,
      ...rest,
    });
    return;
  }
  await writeAuditLog(params);
}
