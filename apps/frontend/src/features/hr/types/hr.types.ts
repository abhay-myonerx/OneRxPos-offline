export type EmploymentStatus =
  | "ACTIVE"
  | "PROBATION"
  | "ON_LEAVE"
  | "SUSPENDED"
  | "RESIGNED"
  | "TERMINATED"
  | "RETIRED"
  | "DECEASED"
  | "CONTRACT_ENDED"
  | "INACTIVE";

export type EmploymentType =
  "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERN" | "TEMPORARY" | "CONSULTANT";

export type Gender = "MALE" | "FEMALE" | "OTHER" | "PREFER_NOT_TO_SAY";

export type ArchivedFilter = "active" | "archived" | "any";

// ── Department ─────────────────────────────────────────────────────────────

export interface Department {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { employees: number };
}

export interface DepartmentListParams {
  page?: number;
  limit?: number;
  sortBy?: "createdAt" | "updatedAt" | "name" | "code";
  sortOrder?: "asc" | "desc";
  search?: string;
  isActive?: boolean;
  archived?: ArchivedFilter;
}

export interface CreateDepartmentInput {
  name: string;
  code: string;
  description?: string | null;
}

export type UpdateDepartmentInput = Partial<CreateDepartmentInput>;

// ── Designation ────────────────────────────────────────────────────────────

export interface Designation {
  id: string;
  tenantId: string;
  title: string;
  code: string;
  level: number | null;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { employees: number };
}

export interface DesignationListParams {
  page?: number;
  limit?: number;
  sortBy?: "createdAt" | "updatedAt" | "title" | "code" | "level";
  sortOrder?: "asc" | "desc";
  search?: string;
  isActive?: boolean;
  archived?: ArchivedFilter;
  level?: number;
}

export interface CreateDesignationInput {
  title: string;
  code: string;
  level?: number | null;
  description?: string | null;
}

export type UpdateDesignationInput = Partial<CreateDesignationInput>;

// ── Employee ───────────────────────────────────────────────────────────────

export interface EmergencyContact {
  name: string;
  relationship?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface EmployeeListItem {
  id: string;
  employeeCode: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  email: string | null;
  phone: string | null;
  employmentStatus: EmploymentStatus;
  employmentType: EmploymentType;
  employmentStartDate: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  department: { id: string; name: string; code: string };
  designation: { id: string; title: string; code: string };
  storeId: string | null;
  reportsToId: string | null;
}

export interface Employee extends EmployeeListItem {
  alternatePhone: string | null;
  dateOfBirth: string | null;
  gender: Gender | null;
  maritalStatus: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  emergencyContact: EmergencyContact | null;
  photo: string | null;
  departmentId: string;
  designationId: string;
  confirmationDate: string | null;
  employmentEndDate: string | null;
  separationReason: string | null;
  separationNotes: string | null;
  noticePeriodDays: number | null;
  notes: string | null;
  userId: string | null;
  tenantId: string;
  reportsTo: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
  } | null;
  sensitiveSummary?: {
    hasNationalId: boolean;
    hasPassportNumber: boolean;
    hasTaxId: boolean;
    hasBankDetails: boolean;
  };
  sensitive?: {
    nationalId: string | null;
    passportNumber: string | null;
    taxId: string | null;
    bankDetails: BankDetails | null;
  };
}

export interface BankDetails {
  accountName: string;
  accountNumber: string;
  bankName: string;
  branch?: string;
  ifsc?: string;
  routing?: string;
  swift?: string;
}

export interface SensitiveUpdateInput {
  nationalId?: string | null;
  passportNumber?: string | null;
  taxId?: string | null;
  bankDetails?: BankDetails | null;
}

export interface SalaryUpdateInput {
  salaryStructureId: string;
  basicPay: string | number;
  ctc?: string | number | null;
  currency?: string;
  effectiveFrom: string;
}

export type SeparationReason =
  | "RESIGNATION"
  | "RETIREMENT"
  | "TERMINATION"
  | "CONTRACT_END"
  | "REDUNDANCY"
  | "DECEASED"
  | "ABSCONDED"
  | "OTHER";

export interface TerminateEmployeeInput {
  employmentEndDate: string;
  separationReason: SeparationReason;
  separationNotes?: string | null;
  deactivateUser?: boolean;
  cancelApprovedFutureLeave?: boolean;
}

export interface TerminationCascadeSummary {
  deactivatedUserId: string | null;
  refreshTokensRevoked: number;
  leaveRequestsCancelled: number;
  shiftSchedulesCancelled: number;
}

export interface EmploymentContract {
  id: string;
  employeeId: string;
  contractNumber: string | null;
  title: string;
  employmentType: EmploymentType;
  departmentId: string | null;
  designationId: string | null;
  storeId: string | null;
  reportsToId: string | null;
  salaryStructureId: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  documentUrl: string | null;
  notes: string | null;
  supersedesId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContractInput {
  contractNumber?: string | null;
  title: string;
  employmentType: EmploymentType;
  departmentId?: string | null;
  designationId?: string | null;
  storeId?: string | null;
  reportsToId?: string | null;
  salaryStructureId?: string | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
  documentUrl?: string | null;
  notes?: string | null;
  supersedesId?: string | null;
}

export interface EmployeeDocument {
  id: string;
  employeeId: string;
  documentType: string;
  fileName: string;
  fileUrl: string;
  mimeType: string | null;
  sizeBytes: number | null;
  expiresAt: string | null;
  isConfidential: boolean;
  uploadedBy: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UploadDocumentInput {
  documentType: string;
  fileName: string;
  fileUrl: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  expiresAt?: string | null;
  isConfidential?: boolean;
  notes?: string | null;
}

export interface EmployeeListParams {
  page?: number;
  limit?: number;
  sortBy?:
    | "createdAt"
    | "updatedAt"
    | "employeeCode"
    | "firstName"
    | "lastName"
    | "employmentStartDate"
    | "employmentStatus";
  sortOrder?: "asc" | "desc";
  search?: string;
  isActive?: boolean;
  archived?: ArchivedFilter;
  departmentId?: string;
  designationId?: string;
  storeId?: string;
  reportsToId?: string;
  employmentStatus?: EmploymentStatus;
  employmentType?: EmploymentType;
}

// Roles an HR actor can mint via the createUser-on-employee flow.
// Mirrors `CREATE_USER_ROLES` in backend `employee.validation.ts`.
// Backend further role-clamps which of these the calling actor is
// allowed to set (HR_MANAGER → CASHIER/EMPLOYEE only).
export type CreateUserRole = "MANAGER" | "HR_MANAGER" | "CASHIER" | "EMPLOYEE";

export interface CreateUserSubInput {
  email: string;
  password?: string;
  role: CreateUserRole;
  storeId?: string | null;
}

export interface CreateEmployeeInput {
  employeeCode: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  email?: string | null;
  phone?: string | null;
  alternatePhone?: string | null;
  dateOfBirth?: string | null;
  gender?: Gender | null;
  maritalStatus?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  emergencyContact?: EmergencyContact | null;
  photo?: string | null;
  departmentId: string;
  designationId: string;
  storeId?: string | null;
  reportsToId?: string | null;
  employmentStatus?: EmploymentStatus;
  employmentType?: EmploymentType;
  employmentStartDate: string;
  confirmationDate?: string | null;
  employmentEndDate?: string | null;
  noticePeriodDays?: number | null;
  notes?: string | null;

  createUser?: CreateUserSubInput;
}

export type UpdateEmployeeInput = Partial<Omit<CreateEmployeeInput, "createUser">>;

export interface CreatedUserResponse {
  id: string;
  email: string;
  role: string;
  temporaryPassword?: string;
}

export interface EmployeeWithUser extends Employee {
  user?: CreatedUserResponse;
}

export type LinkUserInput =
  { userId: string; createUser?: never } | { userId?: never; createUser: CreateUserSubInput };

export const EMPLOYMENT_STATUSES: EmploymentStatus[] = [
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
];

export const EMPLOYMENT_TYPES: EmploymentType[] = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "INTERN",
  "TEMPORARY",
  "CONSULTANT",
];

export const GENDERS: Gender[] = ["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"];
