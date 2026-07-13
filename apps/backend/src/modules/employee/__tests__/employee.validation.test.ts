import { describe, it, expect } from "vitest";

import { createEmployeeSchema, updateEmployeeSchema } from "../employee.validation";

describe("employee.validation — strict body schemas reject unknown keys", () => {
  const validCreate = {
    employeeCode: "EMP100",
    firstName: "Ada",
    lastName: "Lovelace",
    departmentId: "11111111-1111-4111-8111-111111111111",
    designationId: "22222222-2222-4222-8222-222222222222",
    employmentStartDate: "2026-01-01",
  };

  it("createEmployeeSchema accepts a valid minimal payload", () => {
    expect(createEmployeeSchema.safeParse(validCreate).success).toBe(true);
  });

  it("createEmployeeSchema rejects an unrecognized key (mass-assignment guard)", () => {
    const res = createEmployeeSchema.safeParse({
      ...validCreate,
      isActive: false,
      tenantId: "33333333-3333-4333-8333-333333333333",
    });
    expect(res.success).toBe(false);
  });

  it("updateEmployeeSchema accepts a valid partial payload", () => {
    expect(updateEmployeeSchema.safeParse({ firstName: "Grace" }).success).toBe(true);
  });

  it("updateEmployeeSchema rejects an unrecognized key", () => {
    const res = updateEmployeeSchema.safeParse({
      firstName: "Grace",
      role: "ADMIN",
    });
    expect(res.success).toBe(false);
  });
});
