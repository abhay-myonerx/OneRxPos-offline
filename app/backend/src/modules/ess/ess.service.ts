// Employee Self-Service (ESS).
// Per docs/v2/hrm-deep-dives/6.hrm-ess.md.
//
// Cardinal rule (deep-dive §2): ESS owns NO business logic. Every method
// resolves "me" → calls the owning module's published service with the
// resolved self employeeId forced server-side → projects/filters the
// result. Client-supplied employeeId is NEVER trusted (defence against
// horizontal privilege escalation, §10 invariant #2).
//
// Re-derivation in ESS is a defect — call the owning module's service.

import type { TenantPrismaClient } from "../../config/database";
import { AuthorizationError, ConflictError, NotFoundError } from "../../shared/errors";

import * as employeeService from "../employee/employee.service";
import * as attendanceService from "../attendance/attendance.service";
import * as correctionService from "../attendance/attendance.correction.service";
import * as shiftService from "../shift/shift.service";
import * as swapService from "../shift/shift-swap.service";
import * as leaveService from "../leave/leave.service";
import * as holidayService from "../holiday/holiday.service";
import * as payrollService from "../payroll/payroll.service";

import type {
  AttendanceListInput,
  HolidaysQueryInput,
  LeaveApplyInput,
  LeaveBalanceQueryInput,
  LeaveRequestListInput,
  PayslipListInput,
  ProfileUpdateInput,
  PunchInput,
  RegularizeInput,
  ShiftsListInput,
  SummaryQueryInput,
  SwapRequestInput,
  SwapRespondInput,
} from "./ess.validation";
import type { EssActor, ResolvedSelf } from "./ess.types";

// ─── Self-scope resolver (deep-dive §5) ───────────────────────────────────────

const TERMINATED_STATUSES = new Set([
  "TERMINATED",
  "RESIGNED",
  "RETIRED",
  "DECEASED",
  "CONTRACT_ENDED",
]);

const WRITE_ALLOWED_STATUSES = new Set(["ACTIVE", "PROBATION"]);

/**
 * Resolve the authenticated user → their Employee row in the current tenant.
 *
 * 409 NO_LINKED_EMPLOYEE when no Employee row is linked (system-only
 * personas such as SUPER_ADMIN). NEVER returns 500.
 *
 * Terminated employees may READ historical own data (right to access)
 * but write actions (check-in, leave request, swap) must be blocked at
 * the call site via `assertWriteAllowed`.
 */
export async function resolveSelf(db: TenantPrismaClient, actor: EssActor): Promise<ResolvedSelf> {
  const row = (await db.employee.findFirst({
    where: { userId: actor.id, tenantId: actor.tenantId },
    select: {
      id: true,
      tenantId: true,
      userId: true,
      storeId: true,
      employmentStatus: true,
      isActive: true,
      reportsToId: true,
    },
  })) as ResolvedSelf | null;

  if (!row) {
    const err = new ConflictError("No employee record is linked to this user account");
    (err as { code: string }).code = "NO_LINKED_EMPLOYEE";
    throw err;
  }

  return row;
}

function assertWriteAllowed(self: ResolvedSelf): void {
  if (!self.isActive || !WRITE_ALLOWED_STATUSES.has(self.employmentStatus)) {
    const err = new AuthorizationError("Your employment status does not allow this action");
    (err as { code: string }).code = "EMPLOYMENT_INACTIVE";
    throw err;
  }
}

// ─── Projections ──────────────────────────────────────────────────────────────

// Profile projection — only fields the employee may see about themselves.
function projectProfile(emp: Record<string, unknown>) {
  return {
    id: emp.id,
    employeeCode: emp.employeeCode,
    firstName: emp.firstName,
    middleName: emp.middleName,
    lastName: emp.lastName,
    email: emp.email,
    phone: emp.phone,
    alternatePhone: emp.alternatePhone,
    dateOfBirth: emp.dateOfBirth,
    gender: emp.gender,
    maritalStatus: emp.maritalStatus,
    address: emp.address,
    city: emp.city,
    state: emp.state,
    postalCode: emp.postalCode,
    country: emp.country,
    emergencyContact: emp.emergencyContact,
    photo: emp.photo,
    employmentStatus: emp.employmentStatus,
    employmentType: emp.employmentType,
    employmentStartDate: emp.employmentStartDate,
    confirmationDate: emp.confirmationDate,
    department: emp.department,
    designation: emp.designation,
    storeId: emp.storeId,
    reportsTo: emp.reportsTo,
  };
}

// ─── Profile (28.1 / 28.2) ────────────────────────────────────────────────────

export async function getProfile(db: TenantPrismaClient, actor: EssActor) {
  const self = await resolveSelf(db, actor);
  // Delegate to employee module's read (already tenant-scoped via db).
  const emp = await employeeService.getById(db, self.id);
  return projectProfile(emp as unknown as Record<string, unknown>);
}

export async function updateProfile(
  db: TenantPrismaClient,
  actor: EssActor,
  input: ProfileUpdateInput,
) {
  const self = await resolveSelf(db, actor);

  // Split out preferences from the employee
  // patch. Employee.update doesn't accept `preferences` (lives on
  // User), so we write it separately via User.update.
  const { preferences, ...employeePatch } = input as ProfileUpdateInput & {
    preferences?: Record<string, unknown>;
  };

  if (preferences) {
    // Shallow merge with the existing preferences. Read first
    // so unknown keys we didn't touch survive.
    const existing = (await db.user.findUnique({
      where: { id: actor.id },
      select: { preferences: true },
    })) as { preferences: Record<string, unknown> | null } | null;
    await db.user.update({
      where: { id: actor.id },
      data: {
        // Prisma JSON typing wants InputJsonValue; the merged
        // object is structurally identical so cast through
        // `as never` to satisfy the generic.
        preferences: {
          ...(existing?.preferences ?? {}),
          ...preferences,
        } as never,
      },
    });
  }

  // Whitelist is enforced by the Zod schema (.strict()). Pass only the
  // whitelisted subset down — employee.service.update accepts a wider
  // shape, but ESS must never widen it.
  const updated = await employeeService.update(
    db,
    // Actor now carries `role` after Phase 19a — pass it through
    // so the employee service can apply any role-aware checks.
    // EssActor.role is `string`; the employee service expects
    // the Role enum, so we cast through `never` here. Runtime
    // value is exactly the same enum-string the JWT carries.
    {
      id: actor.id,
      tenantId: actor.tenantId,
      role: actor.role as never,
    },
    self.id,
    employeePatch as never,
  );
  return projectProfile(updated as unknown as Record<string, unknown>);
}

// ESS document list. Self-scope + the
// underlying documents service's `excludeConfidential` flag so
// HR-tagged confidential docs (medical, disciplinary) never reach
// the employee's own view.
export async function listMyDocuments(
  db: TenantPrismaClient,
  actor: EssActor,
  params: Record<string, unknown>,
) {
  const self = await resolveSelf(db, actor);
  const { list } = await import("../employee/documents.service");
  return list(db, self.id, params, { excludeConfidential: true });
}

// ─── Attendance (28.3 – 28.6) ─────────────────────────────────────────────────

export async function listMyAttendance(
  db: TenantPrismaClient,
  actor: EssActor,
  input: AttendanceListInput,
) {
  const self = await resolveSelf(db, actor);
  return attendanceService.list(
    db,
    { id: actor.id, tenantId: actor.tenantId, role: actor.role },
    // Force self-scope; ignore any client-supplied employeeId.
    { ...input, scope: "self", employeeId: self.id } as never,
  );
}

export async function getMyToday(db: TenantPrismaClient, actor: EssActor) {
  await resolveSelf(db, actor);
  return attendanceService.getToday(db, {
    id: actor.id,
    tenantId: actor.tenantId,
    role: actor.role,
  });
}

export async function getMyAttendanceSummary(
  db: TenantPrismaClient,
  actor: EssActor,
  input: SummaryQueryInput,
) {
  const self = await resolveSelf(db, actor);
  return attendanceService.getSummary(
    db,
    { id: actor.id, tenantId: actor.tenantId, role: actor.role },
    { ...input, employeeId: self.id },
  );
}

export async function checkIn(
  db: TenantPrismaClient,
  actor: EssActor,
  input: PunchInput,
  requestMeta: { ipAddress?: string | null } = {},
) {
  const self = await resolveSelf(db, actor);
  assertWriteAllowed(self);
  // ESS forwards the raw method claim — attendance module is the sole
  // judge of capture-method validity (geofence/IP/QR/biometric). ESS
  // never re-validates (§10 invariant #7).
  return attendanceService.punch(
    db,
    { id: actor.id, tenantId: actor.tenantId, role: actor.role },
    "CHECK_IN",
    // employeeId omitted → attendance.service.resolveTargetEmployee
    // resolves "me" from actor.id, then enforces self/manual rules.
    { ...input, employeeId: null } as never,
    requestMeta,
  );
}

export async function checkOut(
  db: TenantPrismaClient,
  actor: EssActor,
  input: PunchInput,
  requestMeta: { ipAddress?: string | null } = {},
) {
  const self = await resolveSelf(db, actor);
  assertWriteAllowed(self);
  return attendanceService.punch(
    db,
    { id: actor.id, tenantId: actor.tenantId, role: actor.role },
    "CHECK_OUT",
    { ...input, employeeId: null } as never,
    requestMeta,
  );
}

export async function breakStart(
  db: TenantPrismaClient,
  actor: EssActor,
  input: PunchInput,
  requestMeta: { ipAddress?: string | null } = {},
) {
  const self = await resolveSelf(db, actor);
  assertWriteAllowed(self);
  return attendanceService.punch(
    db,
    { id: actor.id, tenantId: actor.tenantId, role: actor.role },
    "BREAK_START",
    { ...input, employeeId: null } as never,
    requestMeta,
  );
}

export async function breakEnd(
  db: TenantPrismaClient,
  actor: EssActor,
  input: PunchInput,
  requestMeta: { ipAddress?: string | null } = {},
) {
  const self = await resolveSelf(db, actor);
  assertWriteAllowed(self);
  return attendanceService.punch(
    db,
    { id: actor.id, tenantId: actor.tenantId, role: actor.role },
    "BREAK_END",
    { ...input, employeeId: null } as never,
    requestMeta,
  );
}

export async function regularize(db: TenantPrismaClient, actor: EssActor, input: RegularizeInput) {
  const self = await resolveSelf(db, actor);
  assertWriteAllowed(self);
  return correctionService.request(
    db,
    { id: actor.id, tenantId: actor.tenantId, role: actor.role },
    // employeeId omitted → correction.service resolves "me".
    { ...input, employeeId: null } as never,
  );
}

// ─── Shifts (28.7 – 28.9) ─────────────────────────────────────────────────────

export async function listMyShifts(
  db: TenantPrismaClient,
  actor: EssActor,
  input: ShiftsListInput,
) {
  const self = await resolveSelf(db, actor);
  return shiftService.listSchedules(
    db,
    { id: actor.id, tenantId: actor.tenantId, role: actor.role },
    { ...input, scope: "self", employeeId: self.id } as never,
  );
}

export async function requestSwap(
  db: TenantPrismaClient,
  actor: EssActor,
  input: SwapRequestInput,
) {
  const self = await resolveSelf(db, actor);
  assertWriteAllowed(self);
  // Shift swap service validates that the requester schedule belongs to
  // the caller — additional self-scope is enforced there. ESS just
  // forwards.
  return swapService.requestSwap(
    db,
    { id: actor.id, tenantId: actor.tenantId, role: actor.role },
    input,
  );
}

export async function respondSwap(
  db: TenantPrismaClient,
  actor: EssActor,
  swapId: string,
  input: SwapRespondInput,
) {
  const self = await resolveSelf(db, actor);
  assertWriteAllowed(self);
  return swapService.respondPeer(
    db,
    { id: actor.id, tenantId: actor.tenantId, role: actor.role },
    swapId,
    input,
  );
}

// ─── Leave (28.10 – 28.13) ────────────────────────────────────────────────────

export async function listMyLeaveTypes(db: TenantPrismaClient, actor: EssActor) {
  await resolveSelf(db, actor);
  return leaveService.listLeaveTypes(
    db,
    { id: actor.id, tenantId: actor.tenantId, role: actor.role },
    { isActive: true, page: 1, limit: 100 } as never,
  );
}

export async function listMyLeaveBalance(
  db: TenantPrismaClient,
  actor: EssActor,
  input: LeaveBalanceQueryInput,
) {
  const self = await resolveSelf(db, actor);
  return leaveService.listLeaveBalances(
    db,
    { id: actor.id, tenantId: actor.tenantId, role: actor.role },
    {
      ...input,
      scope: "self",
      employeeId: self.id,
      page: 1,
      limit: 100,
    } as never,
  );
}

export async function listMyLeaveRequests(
  db: TenantPrismaClient,
  actor: EssActor,
  input: LeaveRequestListInput,
) {
  const self = await resolveSelf(db, actor);
  return leaveService.listLeaveRequests(
    db,
    { id: actor.id, tenantId: actor.tenantId, role: actor.role },
    { ...input, scope: "self", employeeId: self.id } as never,
  );
}

export async function applyLeave(db: TenantPrismaClient, actor: EssActor, input: LeaveApplyInput) {
  const self = await resolveSelf(db, actor);
  assertWriteAllowed(self);
  // Force self-service path: never pass employeeId, so leave.service
  // resolves "me" from actor.id internally.
  return leaveService.createLeaveRequest(
    db,
    { id: actor.id, tenantId: actor.tenantId, role: actor.role },
    { ...input, employeeId: null } as never,
  );
}

export async function cancelMyLeave(db: TenantPrismaClient, actor: EssActor, id: string) {
  const self = await resolveSelf(db, actor);
  // Read first so we can self-scope before delegating.
  const req = await leaveService.getLeaveRequestById(
    db,
    { id: actor.id, tenantId: actor.tenantId, role: actor.role },
    id,
  );
  if (req.employeeId !== self.id) {
    throw new AuthorizationError("You can only cancel your own leave requests");
  }
  return leaveService.cancelLeaveRequest(
    db,
    { id: actor.id, tenantId: actor.tenantId, role: actor.role },
    id,
  );
}

// ─── Payslips (28.14 – 28.15) ─────────────────────────────────────────────────

export async function listMyPayslips(
  db: TenantPrismaClient,
  actor: EssActor,
  input: PayslipListInput,
) {
  const self = await resolveSelf(db, actor);
  return payrollService.listOwnPayslips(
    db,
    {
      id: actor.id,
      tenantId: actor.tenantId,
      role: actor.role,
      employeeId: self.id,
    },
    input as never,
  );
}

export async function getMyPayslip(db: TenantPrismaClient, actor: EssActor, id: string) {
  const self = await resolveSelf(db, actor);
  // Delegate with ownOnly=true — payroll service enforces own-only and
  // throws AuthorizationError on mismatch.
  return payrollService.getPayslip(
    db,
    {
      id: actor.id,
      tenantId: actor.tenantId,
      role: actor.role,
      employeeId: self.id,
    },
    id,
    true,
  );
}

// ESS-scope payslip HTML (printable). Same
// ownership enforcement as getMyPayslip.
export async function getMyPayslipHtml(
  db: TenantPrismaClient,
  actor: EssActor,
  id: string,
): Promise<string> {
  const self = await resolveSelf(db, actor);
  return payrollService.getPayslipHtml(
    db,
    {
      id: actor.id,
      tenantId: actor.tenantId,
      role: actor.role,
      employeeId: self.id,
    },
    id,
    true,
  );
}

// ─── Holidays (28.16) ─────────────────────────────────────────────────────────

export async function listMyHolidays(
  db: TenantPrismaClient,
  actor: EssActor,
  input: HolidaysQueryInput,
) {
  const self = await resolveSelf(db, actor);
  return holidayService.getCalendar(
    db,
    { id: actor.id, tenantId: actor.tenantId, role: actor.role },
    { year: input.year, storeId: self.storeId ?? undefined } as never,
  );
}

// ─── Dashboard summary ───────────────────────────────────────────────────────

export async function getDashboard(db: TenantPrismaClient, actor: EssActor) {
  const self = await resolveSelf(db, actor);
  const actorWithEmp = {
    id: actor.id,
    tenantId: actor.tenantId,
    role: actor.role,
    employeeId: self.id,
  };
  const leaveActor = {
    id: actor.id,
    tenantId: actor.tenantId,
    role: actor.role,
  };

  // Today + 7-day shift window
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const sevenDaysOut = new Date(startOfDay.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [profile, today, upcomingShifts, leaveBalances, pendingLeave, latestPayslips] =
    await Promise.all([
      employeeService.getById(db, self.id).catch(() => null),
      attendanceService.getToday(db, leaveActor).catch(() => null),
      shiftService
        .listSchedules(db, leaveActor, {
          scope: "self",
          employeeId: self.id,
          from: startOfDay,
          to: sevenDaysOut,
          page: 1,
          limit: 20,
          sortBy: "scheduledDate",
          sortOrder: "asc",
        } as never)
        .catch(() => ({ data: [], pagination: null })),
      leaveService
        .listLeaveBalances(db, leaveActor, {
          scope: "self",
          employeeId: self.id,
          page: 1,
          limit: 50,
          sortBy: "createdAt",
          sortOrder: "desc",
        } as never)
        .catch(() => ({ data: [], pagination: null })),
      leaveService
        .listLeaveRequests(db, leaveActor, {
          scope: "self",
          employeeId: self.id,
          status: "PENDING",
          page: 1,
          limit: 10,
          sortBy: "createdAt",
          sortOrder: "desc",
        } as never)
        .catch(() => ({ data: [], pagination: null })),
      payrollService
        .listOwnPayslips(db, actorWithEmp, {
          page: 1,
          limit: 3,
          sortBy: "createdAt",
          sortOrder: "desc",
          status: "FINALIZED",
        } as never)
        .catch(() => ({ data: [], pagination: null })),
    ]);

  return {
    profile: profile ? projectProfile(profile as unknown as Record<string, unknown>) : null,
    attendanceToday: today,
    upcomingShifts: (upcomingShifts as { data: unknown[] }).data,
    leaveBalances: (leaveBalances as { data: unknown[] }).data,
    pendingLeaveRequests: (pendingLeave as { data: unknown[] }).data,
    recentPayslips: (latestPayslips as { data: unknown[] }).data,
  };
}

// Helper re-exported for tests
export { TERMINATED_STATUSES, WRITE_ALLOWED_STATUSES };

// Silence unused imports in case future deletions remove the only use.
void NotFoundError;
