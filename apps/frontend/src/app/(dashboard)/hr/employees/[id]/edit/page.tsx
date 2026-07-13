"use client";

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "@/shell/nav";
import { ArrowLeft } from "lucide-react";

import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/container";
import { Loading } from "@/components/shared/feedback/Loading";
import { ErrorDisplay } from "@/components/shared/feedback/Error";
import { PermissionDenied } from "@/components/shared/auth/PermissionDenied";

import { usePermissions } from "@/hooks/usePermissions";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { ROUTES } from "@/constants/routes";

import { useGetEmployeeQuery, useUpdateEmployeeMutation } from "@/features/hr/api/employees.api";
import { EmployeeForm } from "@/features/hr/components/EmployeeForm";
import type { CreateEmployeeInput, Employee } from "@/features/hr/types/hr.types";

function toFormState(e: Employee): CreateEmployeeInput {
  return {
    employeeCode: e.employeeCode,
    firstName: e.firstName,
    lastName: e.lastName,
    middleName: e.middleName,
    email: e.email,
    phone: e.phone,
    alternatePhone: e.alternatePhone,
    dateOfBirth: e.dateOfBirth ? e.dateOfBirth.slice(0, 10) : null,
    gender: e.gender,
    maritalStatus: e.maritalStatus,
    address: e.address,
    city: e.city,
    state: e.state,
    postalCode: e.postalCode,
    country: e.country,
    emergencyContact: e.emergencyContact,
    photo: e.photo,
    departmentId: e.departmentId,
    designationId: e.designationId,
    storeId: e.storeId,
    reportsToId: e.reportsToId,
    employmentStatus: e.employmentStatus,
    employmentType: e.employmentType,
    employmentStartDate: e.employmentStartDate.slice(0, 10),
    confirmationDate: e.confirmationDate ? e.confirmationDate.slice(0, 10) : null,
    employmentEndDate: e.employmentEndDate ? e.employmentEndDate.slice(0, 10) : null,
    noticePeriodDays: e.noticePeriodDays,
    notes: e.notes,
  };
}

export default function EditEmployeePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canUpdate = can("hr.employees.update");

  const {
    data: employee,
    isLoading,
    isError,
    refetch,
  } = useGetEmployeeQuery(id, { skip: !canUpdate });

  const [form, setForm] = useState<CreateEmployeeInput | null>(null);
  const [update, { isLoading: updating }] = useUpdateEmployeeMutation();

  // Seed the controlled form once the remote employee resolves.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (employee) setForm(toFormState(employee));
  }, [employee]);

  if (!canUpdate) {
    return (
      <PermissionDenied
        title="You don't have permission to edit this employee."
        missingPermission="hr.employees.update"
      />
    );
  }
  if (isLoading || !form) return <Loading />;
  if (isError) {
    return <ErrorDisplay message="Failed to load employee" onRetry={() => refetch()} />;
  }

  async function handleSubmit() {
    if (!form) return;
    try {
      await update({ id, data: form }).unwrap();
      showSuccess("Employee updated");
      navigate(`${ROUTES.HR_EMPLOYEES}/${id}`);
    } catch (err) {
      showApiError(err);
    }
  }

  return (
    <>
      <Link
        href={`${ROUTES.HR_EMPLOYEES}/${id}`}
        className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>
      <PageHeader title="Edit employee" description="Update this profile." />
      <Card>
        <EmployeeForm
          value={form}
          onChange={setForm}
          onSubmit={handleSubmit}
          onCancel={() => navigate(`${ROUTES.HR_EMPLOYEES}/${id}`)}
          submitLabel="Save changes"
          submitting={updating}
        />
      </Card>
    </>
  );
}
