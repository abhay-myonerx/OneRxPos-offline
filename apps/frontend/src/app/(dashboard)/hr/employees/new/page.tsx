"use client";

import { useMemo, useState } from "react";
import { Link, useNavigate } from "@/shell/nav";
import { ArrowLeft } from "lucide-react";

import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/container";
import { PermissionDenied } from "@/components/shared/auth/PermissionDenied";

import { usePermissions } from "@/hooks/usePermissions";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { ROUTES } from "@/constants/routes";

import { useCreateEmployeeMutation } from "@/features/hr/api/employees.api";
import { EmployeeForm } from "@/features/hr/components/EmployeeForm";
import type { CreateEmployeeInput, CreateUserRole } from "@/features/hr/types/hr.types";

const EMPTY: CreateEmployeeInput = {
  employeeCode: "",
  firstName: "",
  lastName: "",
  middleName: null,
  email: null,
  phone: null,
  alternatePhone: null,
  dateOfBirth: null,
  gender: null,
  maritalStatus: null,
  address: null,
  city: null,
  state: null,
  postalCode: null,
  country: null,
  emergencyContact: null,
  photo: null,
  departmentId: "",
  designationId: "",
  storeId: null,
  reportsToId: null,
  employmentStatus: "ACTIVE",
  employmentType: "FULL_TIME",
  employmentStartDate: new Date().toISOString().slice(0, 10),
  confirmationDate: null,
  employmentEndDate: null,
  noticePeriodDays: null,
  notes: null,
};

export default function NewEmployeePage() {
  const navigate = useNavigate();
  const { can, role } = usePermissions();
  const canCreate = can("hr.employees.create");
  const canCreateUser = can("users.create");

  const availableUserRoles: CreateUserRole[] = useMemo(() => {
    if (role === "SUPER_ADMIN" || role === "ADMIN") {
      return ["MANAGER", "HR_MANAGER", "CASHIER", "EMPLOYEE"];
    }
    if (role === "MANAGER" || role === "HR_MANAGER") {
      return ["CASHIER", "EMPLOYEE"];
    }
    return [];
  }, [role]);

  const [form, setForm] = useState<CreateEmployeeInput>(EMPTY);
  const [create, { isLoading }] = useCreateEmployeeMutation();

  if (!canCreate) {
    return (
      <PermissionDenied
        title="You don't have permission to create employees."
        missingPermission="hr.employees.create"
      />
    );
  }

  async function handleSubmit() {
    try {
      const created = await create(form).unwrap();
      if (created.user?.temporaryPassword) {
        sessionStorage.setItem(
          `rxpos:hr:tempCreds:${created.id}`,
          JSON.stringify({
            email: created.user.email,
            password: created.user.temporaryPassword,
            role: created.user.role,
          }),
        );
      }
      showSuccess(created.user ? "Employee + login created" : "Employee created");
      navigate(`${ROUTES.HR_EMPLOYEES}/${created.id}`);
    } catch (err) {
      showApiError(err);
    }
  }

  return (
    <>
      <Link
        href={ROUTES.HR_EMPLOYEES}
        className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>
      <PageHeader title="New employee" description="Add a team member." />
      <Card>
        <EmployeeForm
          value={form}
          onChange={setForm}
          onSubmit={handleSubmit}
          onCancel={() => navigate(ROUTES.HR_EMPLOYEES)}
          submitLabel="Create employee"
          submitting={isLoading}
          showCreateUserSection={canCreateUser && availableUserRoles.length > 0}
          availableUserRoles={availableUserRoles}
        />
      </Card>
    </>
  );
}
