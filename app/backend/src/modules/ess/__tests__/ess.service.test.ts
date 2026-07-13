// Unit tests for the ESS service No database required —
// owning module services are mocked so we test the self-scope resolver,
// delegation behaviour, and isolation invariants without re-asserting
// the owning modules' business logic.
//
// Coverage:
//   * resolveSelf — 409 NO_LINKED_EMPLOYEE for system-only personas
//   * resolveSelf — tenant-isolated (different tenantId → 409)
//   * getProfile — returns own profile only
//   * updateProfile — whitelisted update reaches employee.update
//   * listMyAttendance — forces self scope, ignores client employeeId
//   * checkIn — blocked when employment status is TERMINATED
//   * checkIn — forwards to attendance.punch
//   * applyLeave — forces self via null employeeId
//   * cancelMyLeave — owner check rejects another employee's request
//   * listMyPayslips — calls payroll listOwnPayslips with self employeeId
//   * listMyHolidays — uses own storeId

import { describe, it, expect, vi, beforeEach } from "vitest";

import { AuthorizationError, ConflictError } from "../../../shared/errors";

// Mock owning module services BEFORE importing the ESS service.
vi.mock("../../employee/employee.service", () => ({
  getById: vi.fn(),
  update: vi.fn(),
}));
vi.mock("../../attendance/attendance.service", () => ({
  list: vi.fn(),
  getToday: vi.fn(),
  getSummary: vi.fn(),
  punch: vi.fn(),
}));
vi.mock("../../attendance/attendance.correction.service", () => ({
  request: vi.fn(),
}));
vi.mock("../../shift/shift.service", () => ({
  listSchedules: vi.fn(),
}));
vi.mock("../../shift/shift-swap.service", () => ({
  requestSwap: vi.fn(),
  respondPeer: vi.fn(),
}));
vi.mock("../../leave/leave.service", () => ({
  listLeaveTypes: vi.fn(),
  listLeaveBalances: vi.fn(),
  listLeaveRequests: vi.fn(),
  createLeaveRequest: vi.fn(),
  getLeaveRequestById: vi.fn(),
  cancelLeaveRequest: vi.fn(),
}));
vi.mock("../../holiday/holiday.service", () => ({
  getCalendar: vi.fn(),
}));
vi.mock("../../payroll/payroll.service", () => ({
  listOwnPayslips: vi.fn(),
  getPayslip: vi.fn(),
}));

import * as essService from "../ess.service";
import * as employeeService from "../../employee/employee.service";
import * as attendanceService from "../../attendance/attendance.service";
import * as shiftService from "../../shift/shift.service";
import * as leaveService from "../../leave/leave.service";
import * as payrollService from "../../payroll/payroll.service";
import * as holidayService from "../../holiday/holiday.service";

type MockFn = ReturnType<typeof vi.fn>;

interface MockDb {
  employee: { findFirst: MockFn };
}

function makeDb(employeeRow: Record<string, unknown> | null): MockDb {
  return {
    employee: {
      findFirst: vi.fn().mockResolvedValue(employeeRow),
    },
  };
}

const actor = { id: "user-1", tenantId: "tenant-1", role: "EMPLOYEE" };

const activeSelf = {
  id: "emp-1",
  tenantId: "tenant-1",
  userId: "user-1",
  storeId: "store-1",
  employmentStatus: "ACTIVE",
  isActive: true,
  reportsToId: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveSelf", () => {
  it("throws 409 NO_LINKED_EMPLOYEE when user has no linked employee", async () => {
    const db = makeDb(null);
    await expect(essService.resolveSelf(db as never, actor)).rejects.toThrow(ConflictError);
    try {
      await essService.resolveSelf(db as never, actor);
    } catch (e) {
      expect((e as { code: string }).code).toBe("NO_LINKED_EMPLOYEE");
    }
  });

  it("is tenant-isolated: looks up by both userId AND tenantId", async () => {
    const db = makeDb(null);
    await expect(
      essService.resolveSelf(db as never, {
        ...actor,
        tenantId: "tenant-other",
      }),
    ).rejects.toThrow(ConflictError);
    // Verify the where clause included both fields.
    expect(db.employee.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          tenantId: "tenant-other",
        }),
      }),
    );
  });

  it("returns the resolved self when employee is linked", async () => {
    const db = makeDb(activeSelf);
    const result = await essService.resolveSelf(db as never, actor);
    expect(result.id).toBe("emp-1");
    expect(result.tenantId).toBe("tenant-1");
  });
});

describe("getProfile", () => {
  it("returns own profile (projected) from employee.getById", async () => {
    const db = makeDb(activeSelf);
    (employeeService.getById as MockFn).mockResolvedValue({
      id: "emp-1",
      employeeCode: "E001",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      phone: "+1-555-0100",
      employmentStatus: "ACTIVE",
      // sensitive fields not included in projection by ESS
      tenantId: "tenant-1",
    });
    const profile = await essService.getProfile(db as never, actor);
    expect(profile.id).toBe("emp-1");
    expect(profile.firstName).toBe("Jane");
    expect(employeeService.getById).toHaveBeenCalledWith(db, "emp-1");
  });
});

describe("updateProfile", () => {
  it("calls employee.update with the resolved self id and whitelisted input only", async () => {
    const db = makeDb(activeSelf);
    (employeeService.update as MockFn).mockResolvedValue({
      id: "emp-1",
      phone: "+1-555-0200",
    });
    await essService.updateProfile(db as never, actor, {
      phone: "+1-555-0200",
      city: "Dhaka",
    });
    // employee.update was called with self id, not actor-supplied employeeId.
    // Actor shape now carries `role` after Phase 19a — propagated by ESS
    // so the employee service can enforce any future role-aware checks.
    expect(employeeService.update).toHaveBeenCalledWith(
      db,
      { id: "user-1", tenantId: "tenant-1", role: "EMPLOYEE" },
      "emp-1",
      { phone: "+1-555-0200", city: "Dhaka" },
    );
  });
});

describe("listMyAttendance", () => {
  it("forces self scope with the resolved self id", async () => {
    const db = makeDb(activeSelf);
    (attendanceService.list as MockFn).mockResolvedValue({ data: [] });
    await essService.listMyAttendance(db as never, actor, {} as never);
    const call = (attendanceService.list as MockFn).mock.calls[0];
    expect(call[2].scope).toBe("self");
    expect(call[2].employeeId).toBe("emp-1");
  });

  it("ignores any client-supplied employeeId", async () => {
    const db = makeDb(activeSelf);
    (attendanceService.list as MockFn).mockResolvedValue({ data: [] });
    await essService.listMyAttendance(db as never, actor, {
      employeeId: "emp-EVIL", // attempted spoof
    } as never);
    const call = (attendanceService.list as MockFn).mock.calls[0];
    // Self id wins — the spread of input is overridden by the forced self.
    expect(call[2].employeeId).toBe("emp-1");
    expect(call[2].scope).toBe("self");
  });
});

describe("checkIn", () => {
  it("rejects with EMPLOYMENT_INACTIVE for TERMINATED employees", async () => {
    const db = makeDb({ ...activeSelf, employmentStatus: "TERMINATED" });
    await expect(
      essService.checkIn(db as never, actor, { method: "WEB" } as never),
    ).rejects.toThrow(AuthorizationError);
    try {
      await essService.checkIn(db as never, actor, { method: "WEB" } as never);
    } catch (e) {
      expect((e as { code: string }).code).toBe("EMPLOYMENT_INACTIVE");
    }
    expect(attendanceService.punch).not.toHaveBeenCalled();
  });

  it("rejects when employee is inactive", async () => {
    const db = makeDb({ ...activeSelf, isActive: false });
    await expect(
      essService.checkIn(db as never, actor, { method: "WEB" } as never),
    ).rejects.toThrow(AuthorizationError);
  });

  it("forwards to attendance.punch with employeeId=null (self path)", async () => {
    const db = makeDb(activeSelf);
    (attendanceService.punch as MockFn).mockResolvedValue({ ok: true });
    await essService.checkIn(db as never, actor, { method: "WEB" } as never, {
      ipAddress: "127.0.0.1",
    });
    const call = (attendanceService.punch as MockFn).mock.calls[0];
    expect(call[2]).toBe("CHECK_IN");
    expect(call[3].employeeId).toBeNull();
    expect(call[4]).toEqual({ ipAddress: "127.0.0.1" });
  });
});

describe("applyLeave", () => {
  it("forces null employeeId so leave.service resolves self internally", async () => {
    const db = makeDb(activeSelf);
    (leaveService.createLeaveRequest as MockFn).mockResolvedValue({ id: "lr-1" });
    await essService.applyLeave(db as never, actor, {
      leaveTypeId: "lt-1",
      startDate: new Date("2026-06-01"),
      endDate: new Date("2026-06-03"),
      isHalfDay: false,
    } as never);
    const call = (leaveService.createLeaveRequest as MockFn).mock.calls[0];
    expect(call[2].employeeId).toBeNull();
    expect(call[2].leaveTypeId).toBe("lt-1");
  });

  it("rejects when employment is inactive", async () => {
    const db = makeDb({ ...activeSelf, employmentStatus: "RESIGNED" });
    await expect(
      essService.applyLeave(db as never, actor, {
        leaveTypeId: "lt-1",
        startDate: new Date("2026-06-01"),
        endDate: new Date("2026-06-03"),
        isHalfDay: false,
      } as never),
    ).rejects.toThrow(AuthorizationError);
    expect(leaveService.createLeaveRequest).not.toHaveBeenCalled();
  });
});

describe("cancelMyLeave", () => {
  it("rejects when the request belongs to another employee", async () => {
    const db = makeDb(activeSelf);
    (leaveService.getLeaveRequestById as MockFn).mockResolvedValue({
      id: "lr-other",
      employeeId: "emp-99",
      status: "PENDING",
    });
    await expect(essService.cancelMyLeave(db as never, actor, "lr-other")).rejects.toThrow(
      AuthorizationError,
    );
    expect(leaveService.cancelLeaveRequest).not.toHaveBeenCalled();
  });

  it("delegates when the request belongs to self", async () => {
    const db = makeDb(activeSelf);
    (leaveService.getLeaveRequestById as MockFn).mockResolvedValue({
      id: "lr-1",
      employeeId: "emp-1",
      status: "PENDING",
    });
    (leaveService.cancelLeaveRequest as MockFn).mockResolvedValue({
      id: "lr-1",
      status: "CANCELLED",
    });
    const result = (await essService.cancelMyLeave(db as never, actor, "lr-1")) as unknown as {
      status: string;
    };
    expect(result.status).toBe("CANCELLED");
  });
});

describe("listMyPayslips", () => {
  it("calls payroll.listOwnPayslips with employeeId forced from resolved self", async () => {
    const db = makeDb(activeSelf);
    (payrollService.listOwnPayslips as MockFn).mockResolvedValue({ data: [] });
    await essService.listMyPayslips(db as never, actor, {} as never);
    const call = (payrollService.listOwnPayslips as MockFn).mock.calls[0];
    expect(call[1].employeeId).toBe("emp-1");
    expect(call[1].tenantId).toBe("tenant-1");
  });
});

describe("getMyPayslip", () => {
  it("calls payroll.getPayslip with ownOnly=true", async () => {
    const db = makeDb(activeSelf);
    (payrollService.getPayslip as MockFn).mockResolvedValue({
      id: "ps-1",
      employeeId: "emp-1",
      status: "FINALIZED",
    });
    await essService.getMyPayslip(db as never, actor, "ps-1");
    const call = (payrollService.getPayslip as MockFn).mock.calls[0];
    expect(call[3]).toBe(true); // ownOnly
  });
});

describe("listMyShifts", () => {
  it("forces self scope and own employeeId", async () => {
    const db = makeDb(activeSelf);
    (shiftService.listSchedules as MockFn).mockResolvedValue({ data: [] });
    await essService.listMyShifts(db as never, actor, {
      employeeId: "emp-EVIL",
    } as never);
    const call = (shiftService.listSchedules as MockFn).mock.calls[0];
    expect(call[2].scope).toBe("self");
    expect(call[2].employeeId).toBe("emp-1");
  });
});

describe("listMyHolidays", () => {
  it("uses the resolved self storeId", async () => {
    const db = makeDb(activeSelf);
    (holidayService.getCalendar as MockFn).mockResolvedValue({ holidays: [] });
    await essService.listMyHolidays(db as never, actor, { year: 2026 });
    const call = (holidayService.getCalendar as MockFn).mock.calls[0];
    expect(call[2].year).toBe(2026);
    expect(call[2].storeId).toBe("store-1");
  });
});

describe("permission denied path (no linked employee)", () => {
  it("every method fails with NO_LINKED_EMPLOYEE for system-only personas", async () => {
    const db = makeDb(null);
    const calls = [
      essService.getProfile(db as never, actor),
      essService.listMyAttendance(db as never, actor, {} as never),
      essService.listMyPayslips(db as never, actor, {} as never),
      essService.listMyShifts(db as never, actor, {} as never),
      essService.listMyLeaveRequests(db as never, actor, {} as never),
    ];
    for (const c of calls) {
      await expect(c).rejects.toThrow(ConflictError);
    }
  });
});
