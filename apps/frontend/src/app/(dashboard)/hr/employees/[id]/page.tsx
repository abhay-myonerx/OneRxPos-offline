// Employee detail — read-only profile + action bar for HR operations.
//
// Key sections:
//   Employment    — department, designation, dates, reports-to
//   Identity      — contact details, ESS account link status
//   Address       — postal address
//   Emergency     — next-of-kin contact
//   HRM extras    — SensitivePiiPanel, ContractsPanel, DocumentsPanel (each
//                   individually permission-gated)
//
// One-time credentials: when a user account is linked or created, the backend
// returns a `temporaryPassword` exactly once.  It is saved to sessionStorage so
// the admin can copy it after any in-page navigation, but vanishes on a hard
// refresh or explicit dismiss.
//
// Termination cascade: terminating an employee triggers a server-side cascade
// (deactivate linked user, revoke sessions, cancel leave/shifts).  The cascade
// summary is shown inline so the operator can see what was affected.
"use client";

import { useMemo, useState } from "react";
import { Link, useParams } from "@/shell/nav";
import {
  Edit,
  Archive,
  RotateCcw,
  ArrowLeft,
  Banknote,
  UserPlus,
  KeyRound,
  Copy,
  XOctagon,
  CheckCircle2,
  Building2,
  Contact,
  MapPin,
  ShieldAlert,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Loading } from "@/components/shared/feedback/Loading";
import { ErrorDisplay } from "@/components/shared/feedback/Error";
import { PermissionDenied } from "@/components/shared/auth/PermissionDenied";

import { usePermissions } from "@/hooks/usePermissions";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { ROUTES } from "@/constants/routes";

import {
  useGetEmployeeQuery,
  useDeactivateEmployeeMutation,
  useRestoreEmployeeMutation,
} from "@/features/hr/api/employees.api";
import { LinkUserDialog } from "@/features/hr/components/LinkUserDialog";
import { SensitivePiiPanel } from "@/features/hr/components/SensitivePiiPanel";
import { SalaryAssignmentDialog } from "@/features/hr/components/SalaryAssignmentDialog";
import { TerminateEmployeeDialog } from "@/features/hr/components/TerminateEmployeeDialog";
import { EmployeeContractsPanel } from "@/features/hr/components/EmployeeContractsPanel";
import { EmployeeDocumentsPanel } from "@/features/hr/components/EmployeeDocumentsPanel";
import type {
  CreateUserRole,
  EmployeeWithUser,
  TerminationCascadeSummary,
} from "@/features/hr/types/hr.types";

interface OneTimeCreds {
  email: string;
  password: string;
  role: string;
}

function fmtDate(value: string | null | undefined): string | null {
  return value ? new Date(value).toLocaleDateString() : null;
}

function DefinitionRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-slate-800 dark:text-slate-100">
        {value ?? <span className="text-slate-400 dark:text-slate-500">—</span>}
      </dd>
    </div>
  );
}

function SectionCard({
  title,
  icon,
  className,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={className}>
      <div className="mb-4 flex items-center gap-2">
        <span className="text-slate-400 dark:text-slate-500">{icon}</span>
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
      </div>
      {children}
    </Card>
  );
}

export default function EmployeeDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const { can, role } = usePermissions();
  const canRead = can("hr.employees.read");
  const canUpdate = can("hr.employees.update");
  const canCreateUser = can("users.create");
  const canUpdateSalary = can("hr.employees.update.salary");
  const canTerminate = can("hr.employees.terminate");

  // Role-scoped user-creation: HR managers may only create CASHIER / EMPLOYEE
  // accounts; only ADMIN / SUPER_ADMIN may grant elevated roles.
  const availableUserRoles: CreateUserRole[] = useMemo(() => {
    if (role === "SUPER_ADMIN" || role === "ADMIN") {
      return ["MANAGER", "HR_MANAGER", "CASHIER", "EMPLOYEE"];
    }
    if (role === "MANAGER" || role === "HR_MANAGER") {
      return ["CASHIER", "EMPLOYEE"];
    }
    return [];
  }, [role]);

  const {
    data: employee,
    isLoading,
    isError,
    refetch,
  } = useGetEmployeeQuery(id, { skip: !canRead });

  const [deactivate, { isLoading: deactivating }] = useDeactivateEmployeeMutation();
  const [restore] = useRestoreEmployeeMutation();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [salaryOpen, setSalaryOpen] = useState(false);
  const [terminateOpen, setTerminateOpen] = useState(false);
  const [lastCascade, setLastCascade] = useState<TerminationCascadeSummary | null>(null);

  // One-time temporary password: the backend returns it exactly once in the
  // link/create response.  We persist it in sessionStorage (keyed by employee
  // id) so the admin can survive a same-tab navigation without losing it, but it
  // disappears on a hard refresh or explicit dismiss — matching the security intent.
  const [oneTimeCreds, setOneTimeCreds] = useState<OneTimeCreds | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = sessionStorage.getItem(`rxpos:hr:tempCreds:${id}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as OneTimeCreds;
    } catch {
      sessionStorage.removeItem(`rxpos:hr:tempCreds:${id}`);
      return null;
    }
  });

  function dismissCreds() {
    sessionStorage.removeItem(`rxpos:hr:tempCreds:${id}`);
    setOneTimeCreds(null);
  }

  async function copyCreds() {
    if (!oneTimeCreds) return;
    try {
      await navigator.clipboard.writeText(`${oneTimeCreds.email}\n${oneTimeCreds.password}`);
      showSuccess("Credentials copied to clipboard");
    } catch {
      // Clipboard may be blocked in an insecure context; the visible block
      // remains for the operator to read.
    }
  }

  function handleLinked(result: EmployeeWithUser) {
    if (result.user?.temporaryPassword) {
      const creds = {
        email: result.user.email,
        password: result.user.temporaryPassword,
        role: result.user.role,
      };
      sessionStorage.setItem(`rxpos:hr:tempCreds:${id}`, JSON.stringify(creds));
      setOneTimeCreds(creds);
    }
    refetch();
  }

  if (!canRead) {
    return (
      <PermissionDenied
        title="You don't have permission to view this employee."
        missingPermission="hr.employees.read"
      />
    );
  }
  if (isLoading) return <Loading />;
  if (isError || !employee) {
    return <ErrorDisplay message="Failed to load employee" onRetry={() => refetch()} />;
  }

  async function handleArchive() {
    try {
      await deactivate(id).unwrap();
      showSuccess("Employee deactivated");
      setConfirmArchive(false);
      refetch();
    } catch (err) {
      showApiError(err);
    }
  }

  async function handleRestore() {
    try {
      await restore(id).unwrap();
      showSuccess("Employee restored");
      refetch();
    } catch (err) {
      showApiError(err);
    }
  }

  const fullName = [employee.firstName, employee.middleName, employee.lastName]
    .filter(Boolean)
    .join(" ");
  const avatarInitials =
    `${employee.firstName.charAt(0)}${employee.lastName.charAt(0)}`.toUpperCase();

  return (
    <>
      <Link
        href={ROUTES.HR_EMPLOYEES}
        className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>

      {/* Profile header */}
      <Card className="mb-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            {employee.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={employee.photo}
                alt={fullName}
                className="h-16 w-16 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary-50 dark:bg-primary-500/15 text-lg font-semibold text-primary-700 dark:text-primary-300">
                {avatarInitials}
              </span>
            )}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                  {fullName}
                </h1>
                <code className="text-xs text-slate-400 dark:text-slate-500">
                  {employee.employeeCode}
                </code>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge variant={employee.isActive ? "success" : "outline"}>
                  {employee.isActive ? "Active" : "Archived"}
                </Badge>
                <Badge variant="info">{employee.employmentStatus.replace(/_/g, " ")}</Badge>
                {employee.designation?.title && (
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    {employee.designation.title}
                    {employee.department?.name ? ` · ${employee.department.name}` : ""}
                  </span>
                )}
              </div>
            </div>
          </div>

          {canUpdate && (
            <div className="flex flex-wrap gap-2">
              {!employee.userId && (
                <Button
                  variant="outline"
                  onClick={() => setLinkOpen(true)}
                  icon={<UserPlus className="h-4 w-4" />}
                >
                  Link user
                </Button>
              )}
              {canUpdateSalary && employee.employmentStatus !== "TERMINATED" && (
                <Button
                  variant="outline"
                  onClick={() => setSalaryOpen(true)}
                  icon={<Banknote className="h-4 w-4" />}
                >
                  Assign salary
                </Button>
              )}
              <Button asChild variant="outline" icon={<Edit className="h-4 w-4" />}>
                <Link href={`${ROUTES.HR_EMPLOYEES}/${employee.id}/edit`}>Edit</Link>
              </Button>
              {employee.isActive ? (
                <Button
                  variant="ghost"
                  onClick={() => setConfirmArchive(true)}
                  icon={<Archive className="h-4 w-4" />}
                >
                  Deactivate
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  onClick={handleRestore}
                  icon={<RotateCcw className="h-4 w-4" />}
                >
                  Restore
                </Button>
              )}
              {canTerminate && employee.employmentStatus !== "TERMINATED" && (
                <Button
                  variant="danger"
                  onClick={() => setTerminateOpen(true)}
                  icon={<XOctagon className="h-4 w-4" />}
                >
                  Terminate
                </Button>
              )}
            </div>
          )}
        </div>
      </Card>

      {oneTimeCreds && (
        <Card className="mb-6 border-warning-200 dark:border-warning-500/30 bg-warning-50 dark:bg-warning-500/15">
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-warning-700 dark:text-warning-300" />
            <div className="flex-1 space-y-3">
              <div>
                <h4 className="text-sm font-semibold text-warning-900">One-time credentials</h4>
                <p className="mt-1 text-xs text-warning-800 dark:text-warning-300">
                  Shown <strong>once</strong> — copy and share now. Refreshing hides it for good.
                </p>
              </div>
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-[10px] uppercase tracking-wide text-warning-700 dark:text-warning-300">
                    Email
                  </dt>
                  <dd className="font-mono text-warning-900">{oneTimeCreds.email}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wide text-warning-700 dark:text-warning-300">
                    Temporary password
                  </dt>
                  <dd className="break-all font-mono text-warning-900">{oneTimeCreds.password}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wide text-warning-700 dark:text-warning-300">
                    Role
                  </dt>
                  <dd className="font-mono text-warning-900">{oneTimeCreds.role}</dd>
                </div>
              </dl>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={copyCreds}
                  icon={<Copy className="h-3.5 w-3.5" />}
                >
                  Copy
                </Button>
                <Button size="sm" variant="ghost" onClick={dismissCreds}>
                  Dismiss
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SectionCard
          title="Employment"
          icon={<Building2 className="h-4 w-4" />}
          className="lg:col-span-2"
        >
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DefinitionRow label="Department" value={employee.department?.name} />
            <DefinitionRow label="Designation" value={employee.designation?.title} />
            <DefinitionRow label="Type" value={employee.employmentType.replace(/_/g, " ")} />
            <DefinitionRow
              label="Reports to"
              value={
                employee.reportsTo
                  ? `${employee.reportsTo.firstName} ${employee.reportsTo.lastName} (${employee.reportsTo.employeeCode})`
                  : null
              }
            />
            <DefinitionRow label="Start date" value={fmtDate(employee.employmentStartDate)} />
            <DefinitionRow label="Confirmation date" value={fmtDate(employee.confirmationDate)} />
            <DefinitionRow label="End date" value={fmtDate(employee.employmentEndDate)} />
            <DefinitionRow
              label="Notice period"
              value={
                employee.noticePeriodDays !== null ? `${employee.noticePeriodDays} days` : null
              }
            />
            <DefinitionRow label="Notes" value={employee.notes} />
          </dl>
        </SectionCard>

        <SectionCard title="Identity" icon={<Contact className="h-4 w-4" />}>
          <dl className="space-y-3">
            <DefinitionRow label="Email" value={employee.email} />
            <DefinitionRow label="Phone" value={employee.phone} />
            <DefinitionRow label="Alternate phone" value={employee.alternatePhone} />
            <DefinitionRow label="Date of birth" value={fmtDate(employee.dateOfBirth)} />
            <DefinitionRow label="Gender" value={employee.gender?.replace(/_/g, " ")} />
            <DefinitionRow label="Marital status" value={employee.maritalStatus} />
            <DefinitionRow
              label="Login account"
              value={
                employee.userId ? (
                  <Badge variant="success">Linked · ESS enabled</Badge>
                ) : (
                  <span className="text-xs text-warning-700 dark:text-warning-300">
                    No user linked — ESS unavailable
                  </span>
                )
              }
            />
          </dl>
        </SectionCard>

        <SectionCard
          title="Address"
          icon={<MapPin className="h-4 w-4" />}
          className="lg:col-span-2"
        >
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DefinitionRow label="Address" value={employee.address} />
            <DefinitionRow label="City" value={employee.city} />
            <DefinitionRow label="State" value={employee.state} />
            <DefinitionRow label="Postal code" value={employee.postalCode} />
            <DefinitionRow label="Country" value={employee.country} />
          </dl>
        </SectionCard>

        <SectionCard title="Emergency contact" icon={<ShieldAlert className="h-4 w-4" />}>
          {employee.emergencyContact ? (
            <dl className="space-y-3">
              <DefinitionRow label="Name" value={employee.emergencyContact.name} />
              <DefinitionRow label="Relationship" value={employee.emergencyContact.relationship} />
              <DefinitionRow label="Phone" value={employee.emergencyContact.phone} />
              <DefinitionRow label="Email" value={employee.emergencyContact.email} />
            </dl>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No emergency contact on file.
            </p>
          )}
        </SectionCard>
      </div>

      {lastCascade && (
        <Card className="mb-4 mt-8 border-success-200 dark:border-success-500/30 bg-success-50 dark:bg-success-500/15">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success-700 dark:text-success-300" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-success-900">
                Termination cascade complete
              </h4>
              <ul className="mt-1.5 space-y-0.5 text-xs text-success-800 dark:text-success-300">
                <li>
                  Linked user:{" "}
                  {lastCascade.deactivatedUserId ? (
                    <>
                      deactivated · {lastCascade.refreshTokensRevoked} active session
                      {lastCascade.refreshTokensRevoked === 1 ? "" : "s"} revoked
                    </>
                  ) : (
                    <>none linked — nothing to do</>
                  )}
                </li>
                <li>Leave requests cancelled: {lastCascade.leaveRequestsCancelled}</li>
                <li>Future shifts cancelled: {lastCascade.shiftSchedulesCancelled}</li>
              </ul>
              <button
                onClick={() => setLastCascade(null)}
                className="mt-2 text-xs text-success-700 dark:text-success-300 hover:underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        </Card>
      )}

      <h3 className="mb-4 mt-8 text-sm font-semibold text-slate-800 dark:text-slate-100">
        HRM extras
      </h3>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SensitivePiiPanel employee={employee} />
        <EmployeeContractsPanel employeeId={employee.id} />
        <div className="lg:col-span-2">
          <EmployeeDocumentsPanel employeeId={employee.id} />
        </div>
      </div>

      <ConfirmDialog
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        onConfirm={handleArchive}
        title="Deactivate this employee?"
        description={`${employee.firstName} ${employee.lastName} will be hidden from active lists. History is kept and you can restore them later.`}
        confirmLabel="Deactivate"
        variant="warning"
        loading={deactivating}
      />

      <LinkUserDialog
        employeeId={employee.id}
        employeeName={`${employee.firstName} ${employee.lastName}`}
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        onLinked={handleLinked}
        canCreateUser={canCreateUser}
        availableUserRoles={availableUserRoles}
      />

      {canUpdateSalary && (
        <SalaryAssignmentDialog
          employeeId={employee.id}
          employeeName={`${employee.firstName} ${employee.lastName}`}
          open={salaryOpen}
          onClose={() => setSalaryOpen(false)}
          onAssigned={() => refetch()}
        />
      )}

      {canTerminate && (
        <TerminateEmployeeDialog
          employeeId={employee.id}
          employeeName={`${employee.firstName} ${employee.lastName}`}
          hasLinkedUser={!!employee.userId}
          open={terminateOpen}
          onClose={() => setTerminateOpen(false)}
          onTerminated={(summary) => {
            setLastCascade(summary);
            refetch();
          }}
        />
      )}
    </>
  );
}
