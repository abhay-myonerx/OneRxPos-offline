"use client";

import { Select } from "@/components/ui/select";
import { useListEmployeesQuery } from "../api/employees.api";

interface EmployeeSelectProps {
  /** Selected employee id (controlled). */
  value: string;
  /** Called with the selected employee id ("" when cleared). */
  onChange: (employeeId: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  error?: string;
  disabled?: boolean;
  className?: string;
}

// Searchable employee picker. Loads the first 100 active employees and filters
// them client-side via the shared Select. Options read "EMP-CODE — First Last".
export function EmployeeSelect({
  value,
  onChange,
  label = "Employee",
  placeholder = "Select an employee…",
  required,
  error,
  disabled,
  className,
}: EmployeeSelectProps) {
  const { data, isLoading, isError } = useListEmployeesQuery({
    limit: 100,
    isActive: true,
    sortBy: "firstName",
    sortOrder: "asc",
  });

  const options = (data?.data ?? []).map((e) => ({
    value: e.id,
    label: `${e.employeeCode} — ${[e.firstName, e.middleName, e.lastName]
      .filter(Boolean)
      .join(" ")}`,
  }));

  return (
    <Select
      label={label}
      className={className}
      placeholder={
        isLoading ? "Loading employees…" : isError ? "Failed to load employees" : placeholder
      }
      options={options}
      value={value}
      onValueChange={(v) => onChange(Array.isArray(v) ? (v[0] ?? "") : v)}
      searchable
      clearable
      required={required}
      error={error}
      disabled={disabled || isLoading || isError}
    />
  );
}
