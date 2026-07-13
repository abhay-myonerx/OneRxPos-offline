// HRM Employee service.
//
// Scope: basic CRUD + soft delete + reports-to cycle detection + FK
// validity (department, designation, store, reportsTo are all
// tenant-scoped via `db`). Sensitive fields, salary, contracts,
// documents, and the terminate workflow are tracked in OPEN_ITEMS.

import crypto from "crypto";

import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../config/database";
import type { TenantPrismaClient } from "../../config/database";
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors";
import { buildPrismaListQuery, formatListResponse } from "../../shared/utils/listQuery";
import { recordAudit } from "../../shared/utils/auditLog";
import { hashPassword } from "../../shared/utils/password";
import { decryptForTenantOrNull, encryptForTenantOrNull } from "../../lib/encryption";
import {
  activeOnly,
  softDelete,
  restoreSoftDeleted,
  withArchived,
  type ArchivedFilter,
} from "../../shared/utils/softDelete";
import {
  resolveUserPermissions,
  isSuperAdmin,
  type AuthUserLike,
} from "../../shared/permissions/resolver";
import { PERMISSIONS_V2 } from "../../shared/permissions/v2-permissions";

import type {
  BankDetails,
  CreateEmployeeInput,
  LinkUserInput,
  ListEmployeeInput,
  SalaryUpdateInput,
  SensitiveUpdateInput,
  TerminateEmployeeInput,
  UpdateEmployeeInput,
} from "./employee.validation";
import * as payrollService from "../payroll/payroll.service";

// Actor type widened to carry role so the service can enforce the
// "HR_MANAGER can only mint EMPLOYEE/CASHIER" rule documented in
// API Reference §8.3.
interface Actor extends AuthUserLike {
  id: string;
  tenantId: string;
}

// Maps each actor role to the set of roles it is allowed to mint via
// the createUser-on-employee flow. SUPER_ADMIN is unrestricted but
// short-circuits at `isSuperAdmin` so it never reaches this map.
const ROLE_MINTABLE_BY: Record<string, ReadonlyArray<string>> = {
  ADMIN: ["MANAGER", "HR_MANAGER", "CASHIER", "EMPLOYEE"],
  MANAGER: ["CASHIER", "EMPLOYEE"],
  HR_MANAGER: ["CASHIER", "EMPLOYEE"],
};

function assertCanCreateUser(actor: Actor, targetRole: string): void {
  if (isSuperAdmin(actor)) return;
  const perms = resolveUserPermissions(actor);
  if (!perms.has(PERMISSIONS_V2.USERS_CREATE)) {
    throw new AuthorizationError("Missing required permission: users.create");
  }
  const allowed = ROLE_MINTABLE_BY[actor.role] ?? [];
  if (!allowed.includes(targetRole)) {
    throw new AuthorizationError(
      `Your role (${actor.role}) cannot create a user with role ${targetRole}`,
    );
  }
}

// Per Schema Conventions §11 once OI-076 ships, plaintext temp
// passwords must never be logged. Until then we generate via crypto
// and return once in the API response only.
function generateTempPassword(): string {
  // 12 chars from URL-safe alphabet — enough entropy for a one-time
  // temp credential without surprising punctuation in shells.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(12);
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}

const searchableFields = [
  "employeeCode",
  "firstName",
  "lastName",
  "middleName",
  "email",
  "phone",
] as const;

// Cycle detection: walk the reports-to chain. Aborts if `targetId`
// appears in the chain starting at `candidateId`.
async function detectsCycle(
  db: TenantPrismaClient,
  candidateId: string,
  targetId: string,
): Promise<boolean> {
  if (candidateId === targetId) return true;
  let cursor: string | null = candidateId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === targetId) return true;
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    const parent: { reportsToId: string | null } | null = await db.employee.findUnique({
      where: { id: cursor },
      select: { reportsToId: true },
    });
    cursor = parent?.reportsToId ?? null;
  }
  return false;
}

async function assertDepartment(db: TenantPrismaClient, id: string) {
  const row = await db.department.findUnique({ where: { id } });
  if (!row) throw new ValidationError("Department does not exist in this tenant");
  if (!row.isActive) throw new ValidationError("Department is not active");
}

async function assertDesignation(db: TenantPrismaClient, id: string) {
  const row = await db.designation.findUnique({ where: { id } });
  if (!row) throw new ValidationError("Designation does not exist in this tenant");
  if (!row.isActive) throw new ValidationError("Designation is not active");
}

async function assertStore(db: TenantPrismaClient, id: string) {
  const row = await db.store.findUnique({ where: { id } });
  if (!row) throw new ValidationError("Store does not exist in this tenant");
}

async function assertManager(db: TenantPrismaClient, managerId: string, selfId?: string) {
  if (selfId && managerId === selfId) {
    throw new ValidationError("An employee cannot report to themselves");
  }
  const manager = await db.employee.findUnique({ where: { id: managerId } });
  if (!manager) {
    throw new ValidationError("Manager (reportsTo) does not exist in this tenant");
  }
  if (selfId) {
    const cycle = await detectsCycle(db, managerId, selfId);
    if (cycle) {
      throw new ValidationError("Assigning this manager would create a reports-to cycle");
    }
  }
}

export async function list(db: TenantPrismaClient, params: ListEmployeeInput) {
  const { archived, isActive, ...rest } = params;

  const baseWhere: Record<string, unknown> =
    archived !== undefined
      ? withArchived({}, archived as ArchivedFilter)
      : isActive !== undefined
        ? { isActive }
        : activeOnly({});

  const { where, orderBy, skip, take, meta } = buildPrismaListQuery(rest as never, {
    searchableFields,
    extraWhere: baseWhere,
  });

  const [data, total] = await Promise.all([
    db.employee.findMany({
      where,
      orderBy,
      skip,
      take,
      select: employeeListSelect,
    }),
    db.employee.count({ where }),
  ]);
  return formatListResponse(data, total, meta);
}

const employeeListSelect = {
  id: true,
  employeeCode: true,
  firstName: true,
  middleName: true,
  lastName: true,
  email: true,
  phone: true,
  employmentStatus: true,
  employmentType: true,
  employmentStartDate: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  department: { select: { id: true, name: true, code: true } },
  designation: { select: { id: true, title: true, code: true } },
  storeId: true,
  reportsToId: true,
} as const;

const employeeDetailSelect = {
  ...employeeListSelect,
  middleName: true,
  alternatePhone: true,
  dateOfBirth: true,
  gender: true,
  maritalStatus: true,
  address: true,
  city: true,
  state: true,
  postalCode: true,
  country: true,
  emergencyContact: true,
  photo: true,
  departmentId: true,
  designationId: true,
  confirmationDate: true,
  employmentEndDate: true,
  separationReason: true,
  separationNotes: true,
  noticePeriodDays: true,
  notes: true,
  userId: true,
  tenantId: true,
  reportsTo: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
    },
  },
} as const;

// Shape of the sensitive-field summary that ships on EVERY detail
// response — even to actors without `hr.employees.read.sensitive`.
// Lets the UI render "National ID: ●●●●● (on file)" without
// leaking the value.
//
// `hasX` is a strict boolean (column non-null). When the actor holds
// `hr.employees.read.sensitive` the service additionally decrypts
// and adds the plaintext values to the `sensitive` block.
interface SensitiveSummary {
  hasNationalId: boolean;
  hasPassportNumber: boolean;
  hasTaxId: boolean;
  hasBankDetails: boolean;
}

interface SensitiveReveal {
  nationalId: string | null;
  passportNumber: string | null;
  taxId: string | null;
  bankDetails: BankDetails | null;
}

const employeeSensitiveSelect = {
  nationalIdEnc: true,
  passportNumberEnc: true,
  taxIdEnc: true,
  bankDetailsEnc: true,
} as const;

function buildSensitiveSummary(row: {
  nationalIdEnc: string | null;
  passportNumberEnc: string | null;
  taxIdEnc: string | null;
  bankDetailsEnc: string | null;
}): SensitiveSummary {
  return {
    hasNationalId: row.nationalIdEnc !== null,
    hasPassportNumber: row.passportNumberEnc !== null,
    hasTaxId: row.taxIdEnc !== null,
    hasBankDetails: row.bankDetailsEnc !== null,
  };
}

function buildSensitiveReveal(
  tenantId: string,
  row: {
    nationalIdEnc: string | null;
    passportNumberEnc: string | null;
    taxIdEnc: string | null;
    bankDetailsEnc: string | null;
  },
): SensitiveReveal {
  const bankPlain = decryptForTenantOrNull(row.bankDetailsEnc, tenantId);
  return {
    nationalId: decryptForTenantOrNull(row.nationalIdEnc, tenantId),
    passportNumber: decryptForTenantOrNull(row.passportNumberEnc, tenantId),
    taxId: decryptForTenantOrNull(row.taxIdEnc, tenantId),
    bankDetails: bankPlain ? (JSON.parse(bankPlain) as BankDetails) : null,
  };
}

/**
 * Returns the employee detail. Every caller gets the
 * `sensitiveSummary` block (presence-only); the optional
 * `revealSensitive` flag (set by the controller based on the actor's
 * `hr.employees.read.sensitive` permission) adds the plaintext
 * `sensitive` block on top.
 */
export async function getById(
  db: TenantPrismaClient,
  id: string,
  options: { revealSensitive?: boolean; tenantId?: string } = {},
) {
  const row = await db.employee.findUnique({
    where: { id },
    select: { ...employeeDetailSelect, ...employeeSensitiveSelect },
  });
  if (!row) throw new NotFoundError("Employee", id);
  const sensitiveSummary = buildSensitiveSummary(row);
  // Drop ciphertext columns from the wire response — never expose
  // raw `*Enc` bytes to clients.
  const {
    nationalIdEnc: _nid,
    passportNumberEnc: _ppt,
    taxIdEnc: _tax,
    bankDetailsEnc: _bnk,
    ...detail
  } = row;
  if (options.revealSensitive) {
    if (!options.tenantId) {
      throw new Error("getById: tenantId required when revealSensitive is true");
    }
    return {
      ...detail,
      sensitiveSummary,
      sensitive: buildSensitiveReveal(options.tenantId, row),
    };
  }
  return { ...detail, sensitiveSummary };
}

/**
 * PATCH /api/v2/hr/employees/:id/sensitive
 *
 * Atomically encrypts and writes the supplied sensitive fields.
 * Fields not present in the input are left untouched; explicit
 * `null` clears the field. Audit log NEVER contains plaintext —
 * the verb records WHICH fields changed, not what they changed to.
 */
// Terminal statuses that mean the employee is already separated. Edits
// (update / updateSensitive / updateSalary) are blocked for these, and a
// fresh termination is refused for them (deep-dive §7.5 / §9.2-1). Only
// the terminate() separation flow may move an employee into one of these.
const SEPARATED_STATUSES = new Set<string>([
  "TERMINATED",
  "RESIGNED",
  "RETIRED",
  "DECEASED",
  "CONTRACT_ENDED",
]);

// Guard: refuse mutations to an already-separated employee. Reactivation
// is a future rehire flow (OI-026 follow-on), not a plain edit.
function assertNotSeparated(status: string): void {
  if (SEPARATED_STATUSES.has(status)) {
    throw new ConflictError(`Cannot modify a separated employee (status: ${status})`);
  }
}

export async function updateSensitive(
  db: TenantPrismaClient,
  actor: Actor,
  id: string,
  input: SensitiveUpdateInput,
) {
  const existing = await db.employee.findUnique({
    where: { id },
    select: {
      ...employeeDetailSelect,
      ...employeeSensitiveSelect,
      employmentStatus: true,
    },
  });
  if (!existing) throw new NotFoundError("Employee", id);
  assertNotSeparated(existing.employmentStatus);

  // Read the current key version from the tenant; cached lookup
  // is cheap (prisma client extension) and avoids assumptions.
  const tenant = await db.tenant.findUnique({
    where: { id: actor.tenantId },
    select: { encryptionKeyVersion: true },
  });
  const version = tenant?.encryptionKeyVersion ?? 1;

  const data: Prisma.EmployeeUpdateInput = {};
  const fieldsChanged: string[] = [];

  if (input.nationalId !== undefined) {
    data.nationalIdEnc = encryptForTenantOrNull(input.nationalId, actor.tenantId, version);
    fieldsChanged.push("nationalId");
  }
  if (input.passportNumber !== undefined) {
    data.passportNumberEnc = encryptForTenantOrNull(input.passportNumber, actor.tenantId, version);
    fieldsChanged.push("passportNumber");
  }
  if (input.taxId !== undefined) {
    data.taxIdEnc = encryptForTenantOrNull(input.taxId, actor.tenantId, version);
    fieldsChanged.push("taxId");
  }
  if (input.bankDetails !== undefined) {
    data.bankDetailsEnc = encryptForTenantOrNull(
      input.bankDetails === null ? null : JSON.stringify(input.bankDetails),
      actor.tenantId,
      version,
    );
    fieldsChanged.push("bankDetails");
  }

  const row = await db.employee.update({
    where: { id },
    data,
    select: { ...employeeDetailSelect, ...employeeSensitiveSelect },
  });

  // Audit: record WHAT changed, never WHICH plaintext value. The
  // before/after snapshots reference the field names only.
  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "EMPLOYEE_SENSITIVE_UPDATED",
    entityType: "Employee",
    entityId: id,
    oldData: {
      ...buildSensitiveSummary(existing),
      fieldsRedacted: ["nationalId", "passportNumber", "taxId", "bankDetails"],
    },
    newData: {
      ...buildSensitiveSummary(row),
      fieldsChanged,
      fieldsRedacted: ["nationalId", "passportNumber", "taxId", "bankDetails"],
    },
  });

  // Return shape mirrors getById — presence summary + reveal
  // (the caller already passed the permission gate to update).
  const sensitive = buildSensitiveReveal(actor.tenantId, row);
  const {
    nationalIdEnc: _nid,
    passportNumberEnc: _ppt,
    taxIdEnc: _tax,
    bankDetailsEnc: _bnk,
    ...detail
  } = row;
  return {
    ...detail,
    sensitiveSummary: buildSensitiveSummary(row),
    sensitive,
  };
}

// Common employee-record shape passed to `prisma.employee.create`.
// Excludes `tenantId` so the caller (raw tx) can stamp it explicitly.
function buildEmployeeCreateData(
  actor: Actor,
  input: CreateEmployeeInput,
): Prisma.EmployeeUncheckedCreateInput {
  return {
    tenantId: actor.tenantId,
    employeeCode: input.employeeCode,
    firstName: input.firstName,
    lastName: input.lastName,
    middleName: input.middleName ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    alternatePhone: input.alternatePhone ?? null,
    dateOfBirth: input.dateOfBirth ?? null,
    gender: input.gender ?? null,
    maritalStatus: input.maritalStatus ?? null,
    address: input.address ?? null,
    city: input.city ?? null,
    state: input.state ?? null,
    postalCode: input.postalCode ?? null,
    country: input.country ?? null,
    emergencyContact: input.emergencyContact
      ? (input.emergencyContact as unknown as Prisma.InputJsonValue)
      : Prisma.JsonNull,
    photo: input.photo ?? null,
    departmentId: input.departmentId,
    designationId: input.designationId,
    storeId: input.storeId ?? null,
    reportsToId: input.reportsToId ?? null,
    employmentStatus: input.employmentStatus ?? "ACTIVE",
    employmentType: input.employmentType ?? "FULL_TIME",
    employmentStartDate: input.employmentStartDate,
    confirmationDate: input.confirmationDate ?? null,
    employmentEndDate: input.employmentEndDate ?? null,
    noticePeriodDays: input.noticePeriodDays ?? null,
    notes: input.notes ?? null,
  };
}

export async function create(db: TenantPrismaClient, actor: Actor, input: CreateEmployeeInput) {
  // Uniqueness
  const dup = await db.employee.findFirst({
    where: { employeeCode: input.employeeCode },
  });
  if (dup) {
    throw new ConflictError(`An employee with code "${input.employeeCode}" already exists`);
  }

  // FK pre-checks (tenant-scoped through `db`)
  await assertDepartment(db, input.departmentId);
  await assertDesignation(db, input.designationId);
  if (input.storeId) await assertStore(db, input.storeId);
  if (input.reportsToId) await assertManager(db, input.reportsToId);

  // ── Branch: no `createUser` → original single-row insert path ──
  if (!input.createUser) {
    const row = await db.employee.create({
      data: buildEmployeeCreateData(actor, input),
      select: employeeDetailSelect,
    });

    await recordAudit({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: "EMPLOYEE_CREATED",
      entityType: "Employee",
      entityId: row.id,
      newData: row,
    });

    return row;
  }

  // ── Branch: createUser → transactional Employee + User pair ──
  // Per API Reference §8.3 the actor must also hold `users.create`.
  // The service additionally clamps target role per actor role.
  assertCanCreateUser(actor, input.createUser.role);

  // Tenant-scoped email uniqueness check on the User table.
  const emailExists = await db.user.findFirst({
    where: { email: input.createUser.email.toLowerCase() },
  });
  if (emailExists) {
    throw new ConflictError(
      `A user with email "${input.createUser.email}" already exists in this tenant`,
    );
  }

  // Resolve store id: prefer explicit createUser.storeId, fall back
  // to the employee's storeId; null for ADMIN/HR_MANAGER (no store).
  const userStoreId =
    input.createUser.storeId !== undefined ? input.createUser.storeId : (input.storeId ?? null);

  // Hash now (before tx) — argon2 is CPU-bound; doing it inside the
  // tx callback would extend the tx hold for no benefit. The plain
  // password is held in-memory only for the response.
  const tempPasswordPlain = input.createUser.password ?? generateTempPassword();
  const tempPasswordHash = await hashPassword(tempPasswordPlain);

  // The tenant-extension prisma client does NOT propagate into
  // `$transaction(async (tx) => …)` callbacks, so we use the raw
  // client and hand-stamp tenantId on every write. The pre-tx
  // checks above (assertDepartment/etc.) already ran against
  // `db`, so any cross-tenant id would have surfaced as a 404
  // before we get here.
  const { employee, user } = await prisma.$transaction(async (tx) => {
    // 1. User row (employeeId left null — will set after step 2).
    const u = await tx.user.create({
      data: {
        tenantId: actor.tenantId,
        storeId: userStoreId,
        email: input.createUser!.email.toLowerCase(),
        passwordHash: tempPasswordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        role: input.createUser!.role as never,
        isActive: true,
      },
      select: { id: true, email: true, role: true },
    });

    // 2. Employee row with userId set to the new user.
    const e = await tx.employee.create({
      data: {
        ...buildEmployeeCreateData(actor, input),
        userId: u.id,
      },
      select: employeeDetailSelect,
    });

    // 3. Back-link: set User.employeeId now that we have it.
    await tx.user.update({
      where: { id: u.id },
      data: { employeeId: e.id },
    });

    return { employee: e, user: u };
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "EMPLOYEE_CREATED",
    entityType: "Employee",
    entityId: employee.id,
    newData: { ...employee, user: { id: user.id, email: user.email, role: user.role } },
  });
  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "USER_CREATED_VIA_HR",
    entityType: "User",
    entityId: user.id,
    // Per audit redaction convention the temp password is NEVER
    // written to the audit log. The plaintext exists only in the
    // HTTP response to the calling operator.
    newData: { id: user.id, email: user.email, role: user.role, employeeId: employee.id },
  });

  // Response includes the freshly-minted credentials so the HR
  // operator can hand them to the employee on first login. Temp
  // password is returned ONCE; never persisted or logged.
  return {
    ...employee,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      // Surface the plaintext only when the service generated it
      // (i.e. caller didn't supply one).
      ...(input.createUser.password ? {} : { temporaryPassword: tempPasswordPlain }),
    },
  };
}

/**
 * PATCH /api/v2/hr/employees/:id/salary
 *
 * Thin wrapper around the payroll module's assignEmployeeSalary —
 * effective-dated salary assignment. The employee id comes from
 * the URL path; the body is otherwise identical to the payroll
 * endpoint, minus `employeeId`. Per API Reference §22.6 +
 * hrm-deep-dive §10.
 */
export async function updateSalary(
  db: TenantPrismaClient,
  actor: Actor,
  employeeId: string,
  input: SalaryUpdateInput,
) {
  // Existence pre-check so the failure mode is a clean 404 rather
  // than the payroll service's generic validation error.
  const exists = await db.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, employmentStatus: true },
  });
  if (!exists) throw new NotFoundError("Employee", employeeId);
  assertNotSeparated(exists.employmentStatus);

  // Delegate. The payroll service handles: structure existence
  // check, supersede-the-previous-active-row workflow, audit log
  // entry. Per Schema Conventions §11 the basicPay/ctc fields are
  // stored encrypted by the payroll service.
  return payrollService.assignEmployeeSalary(db, actor, {
    ...input,
    employeeId,
    // Express the date as ISO string for downstream consumption.
    effectiveFrom: input.effectiveFrom.toISOString().slice(0, 10),
  } as never);
}

/**
 * POST /api/v2/hr/employees/:id/terminate
 *
 * Atomic separation cascade. All steps run
 * inside one `$transaction(tx)` so a partial failure rolls back
 * cleanly:
 *
 *   1. Stamp employmentStatus=TERMINATED + employmentEndDate +
 *      separationReason + separationNotes on the Employee.
 *   2. If `deactivateUser` AND the employee has a linked User:
 *      set User.isActive=false and delete all RefreshToken rows
 *      for that user so they're booted from active sessions.
 *   3. Cancel PENDING LeaveRequest rows (and optionally APPROVED
 *      future ones if `cancelApprovedFutureLeave`).
 *   4. Cancel future ShiftSchedule rows (scheduledDate >= today
 *      AND status = SCHEDULED).
 *
 * Returns the updated employee record + a `cascadeSummary` listing
 * what was touched so the FE can render a confirmation banner.
 */
interface TerminationCascadeSummary {
  deactivatedUserId: string | null;
  refreshTokensRevoked: number;
  leaveRequestsCancelled: number;
  shiftSchedulesCancelled: number;
}

// Map a separation reason (validation enum) to the terminal
// EmploymentStatus it produces (deep-dive §9.2a). A resignation,
// retirement, or death must NOT be recorded as TERMINATED. Reasons with
// no dedicated status (redundancy, absconding, other) fall back to
// TERMINATED, the generic employer-side separation.
const SEPARATION_REASON_TO_STATUS = {
  RESIGNATION: "RESIGNED",
  RETIREMENT: "RETIRED",
  TERMINATION: "TERMINATED",
  CONTRACT_END: "CONTRACT_ENDED",
  REDUNDANCY: "TERMINATED",
  DECEASED: "DECEASED",
  ABSCONDED: "TERMINATED",
  OTHER: "TERMINATED",
} as const;

export async function terminate(
  db: TenantPrismaClient,
  actor: Actor,
  employeeId: string,
  input: TerminateEmployeeInput,
) {
  const existing = await db.employee.findUnique({
    where: { id: employeeId },
    select: {
      ...employeeDetailSelect,
      userId: true,
      employmentStatus: true,
    },
  });
  if (!existing) throw new NotFoundError("Employee", employeeId);

  // Idempotent guard — if already separated (any terminal status),
  // refuse rather than re-running the cascade. Operators can update
  // separation notes via PATCH /:id if they need to amend.
  if (SEPARATED_STATUSES.has(existing.employmentStatus)) {
    throw new ConflictError(`Employee is already separated (${existing.employmentStatus})`);
  }

  // Persist the terminal status that matches the separation reason
  // (not a hardcoded TERMINATED) so downstream payroll/reports classify
  // resignations/retirements/deaths correctly (deep-dive §9.2a).
  const newStatus = SEPARATION_REASON_TO_STATUS[input.separationReason];

  const today = new Date();
  // Normalize today to local midnight UTC to avoid timezone slippage
  // when comparing to scheduledDate (a DATE column).
  today.setUTCHours(0, 0, 0, 0);

  // Compute LeaveRequest cancellation predicate. PENDING is always
  // cancelled; APPROVED future leave is gated on the flag.
  const leaveStatusesToCancel: string[] = ["PENDING"];
  if (input.cancelApprovedFutureLeave) {
    leaveStatusesToCancel.push("APPROVED");
  }

  const result = await prisma.$transaction(async (tx) => {
    // 1. Update the Employee row.
    const employee = await tx.employee.update({
      where: { id: employeeId },
      data: {
        employmentStatus: newStatus,
        employmentEndDate: input.employmentEndDate,
        separationReason: input.separationReason,
        separationNotes: input.separationNotes ?? null,
        // Soft-deactivate so the row drops out of `activeOnly`
        // lists; can be reactivated for rehire (OI-026 follow-on).
        isActive: false,
        // Queue a final-settlement payslip. The next
        // processed PayrollRun picks the employee up (prorated to
        // days worked through employmentEndDate) and clears this
        // flag once that run is approved.
        finalSettlementPending: true,
      },
      select: employeeDetailSelect,
    });

    // 2. Optional user deactivation + session revocation.
    let deactivatedUserId: string | null = null;
    let refreshTokensRevoked = 0;
    if (input.deactivateUser && existing.userId) {
      await tx.user.update({
        where: { id: existing.userId },
        data: { isActive: false },
      });
      const deleted = await tx.refreshToken.deleteMany({
        where: { userId: existing.userId },
      });
      deactivatedUserId = existing.userId;
      refreshTokensRevoked = deleted.count;
    }

    // 3. Cancel matching LeaveRequest rows.
    const leaveResult = await tx.leaveRequest.updateMany({
      where: {
        tenantId: actor.tenantId,
        employeeId,
        status: { in: leaveStatusesToCancel as never },
      },
      data: { status: "CANCELLED" },
    });

    // 4. Cancel future ShiftSchedule rows.
    const shiftResult = await tx.shiftSchedule.updateMany({
      where: {
        tenantId: actor.tenantId,
        employeeId,
        scheduledDate: { gte: today },
        status: "SCHEDULED",
      },
      data: { status: "CANCELLED" },
    });

    return {
      employee,
      cascade: {
        deactivatedUserId,
        refreshTokensRevoked,
        leaveRequestsCancelled: leaveResult.count,
        shiftSchedulesCancelled: shiftResult.count,
      } satisfies TerminationCascadeSummary,
    };
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "EMPLOYEE_TERMINATED",
    entityType: "Employee",
    entityId: employeeId,
    oldData: {
      employmentStatus: existing.employmentStatus,
      isActive: true,
    },
    newData: {
      employmentStatus: newStatus,
      employmentEndDate: input.employmentEndDate,
      separationReason: input.separationReason,
      cascade: result.cascade,
      // Notes redacted — may contain sensitive HR detail.
      fieldsRedacted: ["separationNotes"],
    },
  });

  return {
    ...result.employee,
    cascadeSummary: result.cascade,
  };
}

/**
 * POST /api/v2/hr/employees/:id/link-user
 *
 * Two modes (validation enforces exactly-one):
 *   - `userId` provided: link an existing user (typical for promoting
 *     an existing CASHIER to a full-staff employee — the User stays
 *     unchanged, only `User.employeeId` and `Employee.userId` are
 *     wired up).
 *   - `createUser` provided: mint a new user (same shape and
 *     authorization rules as the embedded `createUser` flow above).
 *
 * Rejects (409) when the employee already has a `userId`, or when the
 * candidate user already has an `employeeId`.
 */
export async function linkUser(
  db: TenantPrismaClient,
  actor: Actor,
  employeeId: string,
  input: LinkUserInput,
) {
  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    select: { ...employeeDetailSelect, userId: true },
  });
  if (!employee) throw new NotFoundError("Employee", employeeId);
  if (employee.userId) {
    throw new ConflictError("Employee is already linked to a user account");
  }

  // ── Mode A: link existing user ────────────────────────────────────
  if (input.userId) {
    const candidate = await db.user.findUnique({
      where: { id: input.userId },
      select: {
        id: true,
        email: true,
        role: true,
        employeeId: true,
        isActive: true,
      },
    });
    if (!candidate) throw new NotFoundError("User", input.userId);
    if (candidate.employeeId) {
      throw new ConflictError("User is already linked to another employee");
    }

    const { updatedEmployee, linkedUser } = await prisma.$transaction(async (tx) => {
      const e = await tx.employee.update({
        where: { id: employeeId },
        data: { userId: candidate.id },
        select: employeeDetailSelect,
      });
      const u = await tx.user.update({
        where: { id: candidate.id },
        data: { employeeId },
        select: { id: true, email: true, role: true },
      });
      return { updatedEmployee: e, linkedUser: u };
    });

    await recordAudit({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: "EMPLOYEE_USER_LINKED",
      entityType: "Employee",
      entityId: employeeId,
      newData: { userId: linkedUser.id, email: linkedUser.email },
    });

    return {
      ...updatedEmployee,
      user: linkedUser,
    };
  }

  // ── Mode B: createUser (mint + link) ──────────────────────────────
  // Reuse the same authorization, role-clamp, and email-uniqueness
  // logic as the embedded createUser flow.
  const sub = input.createUser!;
  assertCanCreateUser(actor, sub.role);

  const emailExists = await db.user.findFirst({
    where: { email: sub.email.toLowerCase() },
  });
  if (emailExists) {
    throw new ConflictError(`A user with email "${sub.email}" already exists in this tenant`);
  }

  const userStoreId = sub.storeId !== undefined ? sub.storeId : (employee.storeId ?? null);
  const tempPasswordPlain = sub.password ?? generateTempPassword();
  const tempPasswordHash = await hashPassword(tempPasswordPlain);

  const { updatedEmployee, newUser } = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        tenantId: actor.tenantId,
        storeId: userStoreId,
        email: sub.email.toLowerCase(),
        passwordHash: tempPasswordHash,
        firstName: employee.firstName,
        lastName: employee.lastName,
        role: sub.role as never,
        employeeId: employeeId,
        isActive: true,
      },
      select: { id: true, email: true, role: true },
    });
    const e = await tx.employee.update({
      where: { id: employeeId },
      data: { userId: u.id },
      select: employeeDetailSelect,
    });
    return { updatedEmployee: e, newUser: u };
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "EMPLOYEE_USER_LINKED",
    entityType: "Employee",
    entityId: employeeId,
    newData: { userId: newUser.id, email: newUser.email, created: true },
  });
  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "USER_CREATED_VIA_HR",
    entityType: "User",
    entityId: newUser.id,
    newData: {
      id: newUser.id,
      email: newUser.email,
      role: newUser.role,
      employeeId,
    },
  });

  return {
    ...updatedEmployee,
    user: {
      id: newUser.id,
      email: newUser.email,
      role: newUser.role,
      ...(sub.password ? {} : { temporaryPassword: tempPasswordPlain }),
    },
  };
}

export async function update(
  db: TenantPrismaClient,
  actor: Actor,
  id: string,
  input: UpdateEmployeeInput,
) {
  const existing = await db.employee.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Employee", id);
  assertNotSeparated(existing.employmentStatus);

  // Lifecycle transitions INTO a terminal/separated state must go
  // through terminate() (cascade + audit), never a plain PATCH.
  if (input.employmentStatus && SEPARATED_STATUSES.has(input.employmentStatus)) {
    throw new ConflictError(
      `Cannot set employmentStatus to ${input.employmentStatus} via update — use the terminate endpoint`,
    );
  }

  if (input.employeeCode && input.employeeCode !== existing.employeeCode) {
    const conflict = await db.employee.findFirst({
      where: { employeeCode: input.employeeCode, id: { not: id } },
    });
    if (conflict) {
      throw new ConflictError(`An employee with code "${input.employeeCode}" already exists`);
    }
  }

  if (input.departmentId) await assertDepartment(db, input.departmentId);
  if (input.designationId) await assertDesignation(db, input.designationId);
  if (input.storeId) await assertStore(db, input.storeId);
  if (input.reportsToId !== undefined && input.reportsToId !== null) {
    await assertManager(db, input.reportsToId, id);
  }

  const row = await db.employee.update({
    where: { id },
    data: {
      employeeCode: input.employeeCode ?? undefined,
      firstName: input.firstName ?? undefined,
      lastName: input.lastName ?? undefined,
      middleName: input.middleName === undefined ? undefined : input.middleName,
      email: input.email === undefined ? undefined : input.email,
      phone: input.phone === undefined ? undefined : input.phone,
      alternatePhone: input.alternatePhone === undefined ? undefined : input.alternatePhone,
      dateOfBirth: input.dateOfBirth === undefined ? undefined : input.dateOfBirth,
      gender: input.gender === undefined ? undefined : input.gender,
      maritalStatus: input.maritalStatus === undefined ? undefined : input.maritalStatus,
      address: input.address === undefined ? undefined : input.address,
      city: input.city === undefined ? undefined : input.city,
      state: input.state === undefined ? undefined : input.state,
      postalCode: input.postalCode === undefined ? undefined : input.postalCode,
      country: input.country === undefined ? undefined : input.country,
      emergencyContact:
        input.emergencyContact === undefined
          ? undefined
          : input.emergencyContact === null
            ? Prisma.JsonNull
            : (input.emergencyContact as unknown as Prisma.InputJsonValue),
      photo: input.photo === undefined ? undefined : input.photo,
      departmentId: input.departmentId ?? undefined,
      designationId: input.designationId ?? undefined,
      storeId: input.storeId === undefined ? undefined : input.storeId,
      reportsToId: input.reportsToId === undefined ? undefined : input.reportsToId,
      employmentStatus: input.employmentStatus ?? undefined,
      employmentType: input.employmentType ?? undefined,
      employmentStartDate: input.employmentStartDate ?? undefined,
      confirmationDate: input.confirmationDate === undefined ? undefined : input.confirmationDate,
      employmentEndDate:
        input.employmentEndDate === undefined ? undefined : input.employmentEndDate,
      noticePeriodDays: input.noticePeriodDays === undefined ? undefined : input.noticePeriodDays,
      notes: input.notes === undefined ? undefined : input.notes,
    },
    select: employeeDetailSelect,
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "EMPLOYEE_UPDATED",
    entityType: "Employee",
    entityId: row.id,
    oldData: existing,
    newData: row,
  });

  return row;
}

export async function deactivate(db: TenantPrismaClient, actor: Actor, id: string) {
  const existing = await db.employee.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Employee", id);
  if (!existing.isActive) return existing;

  const row = (await softDelete(db.employee, id)) as typeof existing;

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "EMPLOYEE_DEACTIVATED",
    entityType: "Employee",
    entityId: id,
    oldData: existing,
    newData: row,
  });

  return row;
}

export async function restore(db: TenantPrismaClient, actor: Actor, id: string) {
  const existing = await db.employee.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Employee", id);
  if (existing.isActive) return existing;

  const row = (await restoreSoftDeleted(db.employee, id)) as typeof existing;

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "EMPLOYEE_REACTIVATED",
    entityType: "Employee",
    entityId: id,
    oldData: existing,
    newData: row,
  });

  return row;
}
