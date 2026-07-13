// Zod schemas for the HRM Employee module.
//
// Phase 6 MVP scope intentionally excluded sensitive fields (nationalId,
// passport, taxId, bankDetails), salary, employment contracts,
// documents, and the terminate workflow — still tracked in
// OPEN_ITEMS (OI-023..OI-026).
//
// `createUser` body field on POST and the link-existing-user endpoint
// landed on 2026-05-23 — OI-027 closed. See
// docs/v2/HRM_COMPLETION_PLAN.md.

import { z } from "zod";

import { createListQuerySchema } from "../../shared/utils/listQuery";

const EMPLOYMENT_STATUS = [
  "ACTIVE",
  "PROBATION",
  "ON_LEAVE",
  "SUSPENDED",
  "RESIGNED",
  "TERMINATED",
  "RETIRED",
  "DECEASED",
  "CONTRACT_ENDED",
  "INACTIVE",
] as const;

const EMPLOYMENT_TYPE = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "INTERN",
  "TEMPORARY",
  "CONSULTANT",
] as const;

const GENDER = ["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"] as const;

// Roles an HR actor is allowed to mint via the createUser-on-employee
// flow. SUPER_ADMIN / ADMIN are intentionally excluded — those go
// through the Users module. ACCOUNTANT is excluded because HR
// shouldn't be minting finance roles either.
const CREATE_USER_ROLES = ["MANAGER", "HR_MANAGER", "CASHIER", "EMPLOYEE"] as const;

export const idParamSchema = z.object({
  id: z.string().uuid("Invalid employee id"),
});

// Shared "create-a-login" sub-schema. Password is optional — when
// omitted the service generates one and returns the temporary plaintext
// in the response so the HR operator can hand it to the employee.
export const createUserSubSchema = z
  .object({
    email: z.string().trim().email("Invalid email").max(255),
    password: z.string().min(8, "Password must be at least 8 characters").max(128).optional(),
    role: z.enum(CREATE_USER_ROLES),
    storeId: z.string().uuid().optional().nullable(),
  })
  .strict();
export type CreateUserSubInput = z.infer<typeof createUserSubSchema>;

export const listQuerySchema = createListQuerySchema({
  sortable: [
    "createdAt",
    "updatedAt",
    "employeeCode",
    "firstName",
    "lastName",
    "employmentStartDate",
    "employmentStatus",
  ] as const,
  defaultSortBy: "createdAt",
  defaultSortOrder: "desc",
  filters: z.object({
    isActive: z.coerce.boolean().optional(),
    archived: z.enum(["active", "archived", "any"]).optional(),
    departmentId: z.string().uuid().optional(),
    designationId: z.string().uuid().optional(),
    storeId: z.string().uuid().optional(),
    reportsToId: z.string().uuid().optional(),
    employmentStatus: z.enum(EMPLOYMENT_STATUS).optional(),
    employmentType: z.enum(EMPLOYMENT_TYPE).optional(),
  }),
});
export type ListEmployeeInput = z.infer<typeof listQuerySchema>;

const emergencyContactSchema = z
  .object({
    name: z.string().max(200),
    relationship: z.string().max(120).optional().nullable(),
    phone: z.string().max(50).optional().nullable(),
    email: z.string().email().optional().nullable(),
  })
  .strict();

export const createEmployeeSchema = z
  .object({
    employeeCode: z
      .string()
      .trim()
      .min(1, "Employee code is required")
      .max(40)
      .regex(
        /^[A-Za-z0-9_-]+$/,
        "Employee code must be alphanumeric (hyphens and underscores allowed)",
      ),
    firstName: z.string().trim().min(1, "First name is required").max(100),
    lastName: z.string().trim().min(1, "Last name is required").max(100),
    middleName: z.string().trim().max(100).optional().nullable(),
    email: z.string().trim().email("Invalid email").max(255).optional().nullable(),
    phone: z.string().trim().max(50).optional().nullable(),
    alternatePhone: z.string().trim().max(50).optional().nullable(),
    dateOfBirth: z.coerce.date().optional().nullable(),
    gender: z.enum(GENDER).optional().nullable(),
    maritalStatus: z.string().trim().max(40).optional().nullable(),
    address: z.string().max(2000).optional().nullable(),
    city: z.string().max(120).optional().nullable(),
    state: z.string().max(120).optional().nullable(),
    postalCode: z.string().max(40).optional().nullable(),
    country: z.string().length(2, "Country must be a 2-letter ISO code").optional().nullable(),
    emergencyContact: emergencyContactSchema.optional().nullable(),
    photo: z.string().url("Photo must be a URL").optional().nullable(),
    departmentId: z.string().uuid("Invalid department id"),
    designationId: z.string().uuid("Invalid designation id"),
    storeId: z.string().uuid("Invalid store id").optional().nullable(),
    reportsToId: z.string().uuid("Invalid manager id").optional().nullable(),
    employmentStatus: z.enum(EMPLOYMENT_STATUS).optional(),
    employmentType: z.enum(EMPLOYMENT_TYPE).optional(),
    employmentStartDate: z.coerce.date(),
    confirmationDate: z.coerce.date().optional().nullable(),
    employmentEndDate: z.coerce.date().optional().nullable(),
    noticePeriodDays: z.coerce.number().int().min(0).max(365).optional().nullable(),
    notes: z.string().max(4000).optional().nullable(),
    // Optional — if present, atomically creates a linked User (login)
    // alongside the Employee. Per API Reference §8.3 the actor must
    // hold `users.create` in addition to `hr.employees.create`. Role
    // is constrained by `CREATE_USER_ROLES` above and further
    // role-clamped by the service per actor role.
    createUser: createUserSubSchema.optional(),
  })
  .strict()
  .refine((v) => !v.employmentEndDate || v.employmentEndDate >= v.employmentStartDate, {
    path: ["employmentEndDate"],
    message: "Employment end date must be on or after the start date",
  })
  .refine((v) => !v.confirmationDate || v.confirmationDate >= v.employmentStartDate, {
    path: ["confirmationDate"],
    message: "Confirmation date must be on or after the start date",
  });
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

// `partial` on a refined object schema doesn't compose, so we build
// the update schema explicitly from the same field set.
export const updateEmployeeSchema = z
  .object({
    employeeCode: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    middleName: z.string().trim().max(100).optional().nullable(),
    email: z.string().trim().email().max(255).optional().nullable(),
    phone: z.string().trim().max(50).optional().nullable(),
    alternatePhone: z.string().trim().max(50).optional().nullable(),
    dateOfBirth: z.coerce.date().optional().nullable(),
    gender: z.enum(GENDER).optional().nullable(),
    maritalStatus: z.string().trim().max(40).optional().nullable(),
    address: z.string().max(2000).optional().nullable(),
    city: z.string().max(120).optional().nullable(),
    state: z.string().max(120).optional().nullable(),
    postalCode: z.string().max(40).optional().nullable(),
    country: z.string().length(2).optional().nullable(),
    emergencyContact: emergencyContactSchema.optional().nullable(),
    photo: z.string().url().optional().nullable(),
    departmentId: z.string().uuid().optional(),
    designationId: z.string().uuid().optional(),
    storeId: z.string().uuid().optional().nullable(),
    reportsToId: z.string().uuid().optional().nullable(),
    employmentStatus: z.enum(EMPLOYMENT_STATUS).optional(),
    employmentType: z.enum(EMPLOYMENT_TYPE).optional(),
    employmentStartDate: z.coerce.date().optional(),
    confirmationDate: z.coerce.date().optional().nullable(),
    employmentEndDate: z.coerce.date().optional().nullable(),
    noticePeriodDays: z.coerce.number().int().min(0).max(365).optional().nullable(),
    notes: z.string().max(4000).optional().nullable(),
  })
  .strict()
  .refine(
    (v) =>
      !v.employmentEndDate ||
      !v.employmentStartDate ||
      v.employmentEndDate >= v.employmentStartDate,
    {
      path: ["employmentEndDate"],
      message: "Employment end date must be on or after the start date",
    },
  );
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

// POST /api/v2/hr/employees/:id/link-user
//
// Two modes (exactly one required):
//   * `userId` — link an existing user (typical for promoting an
//     existing CASHIER to a full-staff employee).
//   * `createUser` — mint a brand-new user (same shape as the
//     embedded createUser flow above; same role + permission rules).
//
// Cannot send both; cannot send neither.
export const linkUserSchema = z
  .object({
    userId: z.string().uuid().optional(),
    createUser: createUserSubSchema.optional(),
  })
  .strict()
  .refine((v) => (v.userId && !v.createUser) || (!v.userId && v.createUser), {
    message: "Provide exactly one of `userId` or `createUser` (not both / not neither)",
  });
export type LinkUserInput = z.infer<typeof linkUserSchema>;

// ── sensitive PII ────────────────────────────
//
// PATCH /api/v2/hr/employees/:id/sensitive
//
// All fields optional — patching `{ nationalId: null }` explicitly
// clears that field, `{ nationalId: undefined }` (key absent) leaves
// it untouched. Backend gates on `hr.employees.update.sensitive`.
// Storage path goes through `encryptForTenantOrNull` so the DB
// only ever sees ciphertext.
const bankDetailsSchema = z
  .object({
    accountName: z.string().min(1).max(200),
    accountNumber: z.string().min(1).max(80),
    bankName: z.string().min(1).max(200),
    branch: z.string().max(200).optional(),
    ifsc: z.string().max(50).optional(),
    routing: z.string().max(50).optional(),
    swift: z.string().max(50).optional(),
  })
  .strict();

export const sensitiveUpdateSchema = z
  .object({
    nationalId: z.string().min(1).max(80).nullable().optional(),
    passportNumber: z.string().min(1).max(80).nullable().optional(),
    taxId: z.string().min(1).max(80).nullable().optional(),
    bankDetails: bankDetailsSchema.nullable().optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.nationalId !== undefined ||
      v.passportNumber !== undefined ||
      v.taxId !== undefined ||
      v.bankDetails !== undefined,
    { message: "At least one sensitive field must be provided" },
  );
export type SensitiveUpdateInput = z.infer<typeof sensitiveUpdateSchema>;
export type BankDetails = z.infer<typeof bankDetailsSchema>;

// ── salary endpoint ─────────────────────────
//
// PATCH /api/v2/hr/employees/:id/salary
//
// Thin wrapper around the payroll module's
// POST /payroll/employee-salaries — the employee id comes from the
// path param so the body excludes it. Effective-dated: creates a
// new EmployeeSalary row and supersedes the previous active one.
// Per API Reference §22.6 + hrm-deep-dive §10.
const positiveDecimalStr = z
  .union([z.number().positive(), z.string()])
  .transform((v) => String(v))
  .refine((s) => /^[0-9]+(\.[0-9]{1,4})?$/.test(s) && Number(s) > 0, {
    message: "Must be a positive decimal with up to 4 fractional digits",
  });

const nonNegativeDecimalStr = z
  .union([z.number().nonnegative(), z.string()])
  .transform((v) => String(v))
  .refine((s) => /^[0-9]+(\.[0-9]{1,4})?$/.test(s), {
    message: "Must be a non-negative decimal with up to 4 fractional digits",
  });

export const salaryUpdateSchema = z
  .object({
    salaryStructureId: z.string().uuid(),
    basicPay: positiveDecimalStr,
    ctc: nonNegativeDecimalStr.optional().nullable(),
    currency: z.string().length(3).toUpperCase().default("USD"),
    effectiveFrom: z.coerce.date(),
  })
  .strict();
export type SalaryUpdateInput = z.infer<typeof salaryUpdateSchema>;

// ── terminate workflow ──────────────────────
//
// POST /api/v2/hr/employees/:id/terminate
//
// Atomic cascade: set employmentStatus (mapped from separationReason —
// RESIGNATION→RESIGNED, RETIREMENT→RETIRED, CONTRACT_END→CONTRACT_ENDED,
// DECEASED→DECEASED, else TERMINATED) + employmentEndDate
// + separation*, optionally deactivate the linked User (and revoke
// refresh tokens), cancel pending LeaveRequests, cancel future
// ShiftSchedule rows. APPROVED leave that overlaps termination is
// HR's manual call (we don't auto-cancel it).
export const SEPARATION_REASONS = [
  "RESIGNATION",
  "RETIREMENT",
  "TERMINATION",
  "CONTRACT_END",
  "REDUNDANCY",
  "DECEASED",
  "ABSCONDED",
  "OTHER",
] as const;

export const terminateEmployeeSchema = z
  .object({
    employmentEndDate: z.coerce.date(),
    separationReason: z.enum(SEPARATION_REASONS),
    separationNotes: z.string().max(4000).optional().nullable(),
    deactivateUser: z.boolean().default(true),
    // When true the cascade cancels APPROVED future leave too.
    // Defaults false — APPROVED leave is contractually owed.
    cancelApprovedFutureLeave: z.boolean().default(false),
  })
  .strict();
export type TerminateEmployeeInput = z.infer<typeof terminateEmployeeSchema>;
