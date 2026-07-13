// Thin async adapter layer for ESS. No business logic here.

import type { Request, Response } from "express";

import { asyncHandler, sendCreated, sendSuccess } from "../../shared/utils";

import * as service from "./ess.service";
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
import type { EssActor } from "./ess.types";

function actorFrom(req: Request): EssActor {
  return {
    id: req.user!.id,
    tenantId: req.user!.tenantId,
    role: req.user!.role as string,
  };
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  const out = await service.getProfile(req.db!, actorFrom(req));
  return sendSuccess(res, out);
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const out = await service.updateProfile(req.db!, actorFrom(req), req.body as ProfileUpdateInput);
  return sendSuccess(res, out);
});

// ─── Attendance ───────────────────────────────────────────────────────────────

export const listAttendance = asyncHandler(async (req: Request, res: Response) => {
  const out = await service.listMyAttendance(
    req.db!,
    actorFrom(req),
    req.query as unknown as AttendanceListInput,
  );
  return res.json({ success: true, ...out });
});

export const today = asyncHandler(async (req: Request, res: Response) => {
  const out = await service.getMyToday(req.db!, actorFrom(req));
  return sendSuccess(res, out);
});

export const summary = asyncHandler(async (req: Request, res: Response) => {
  const out = await service.getMyAttendanceSummary(
    req.db!,
    actorFrom(req),
    req.query as unknown as SummaryQueryInput,
  );
  return sendSuccess(res, out);
});

export const checkIn = asyncHandler(async (req: Request, res: Response) => {
  const out = await service.checkIn(req.db!, actorFrom(req), req.body as PunchInput, {
    ipAddress: req.ip ?? null,
  });
  return sendCreated(res, out);
});

export const checkOut = asyncHandler(async (req: Request, res: Response) => {
  const out = await service.checkOut(req.db!, actorFrom(req), req.body as PunchInput, {
    ipAddress: req.ip ?? null,
  });
  return sendCreated(res, out);
});

export const breakStart = asyncHandler(async (req: Request, res: Response) => {
  const out = await service.breakStart(req.db!, actorFrom(req), req.body as PunchInput, {
    ipAddress: req.ip ?? null,
  });
  return sendCreated(res, out);
});

export const breakEnd = asyncHandler(async (req: Request, res: Response) => {
  const out = await service.breakEnd(req.db!, actorFrom(req), req.body as PunchInput, {
    ipAddress: req.ip ?? null,
  });
  return sendCreated(res, out);
});

export const regularize = asyncHandler(async (req: Request, res: Response) => {
  const out = await service.regularize(req.db!, actorFrom(req), req.body as RegularizeInput);
  return sendCreated(res, out);
});

// ─── Shifts ───────────────────────────────────────────────────────────────────

export const listShifts = asyncHandler(async (req: Request, res: Response) => {
  const out = await service.listMyShifts(
    req.db!,
    actorFrom(req),
    req.query as unknown as ShiftsListInput,
  );
  return res.json({ success: true, ...out });
});

export const requestSwap = asyncHandler(async (req: Request, res: Response) => {
  const out = await service.requestSwap(req.db!, actorFrom(req), req.body as SwapRequestInput);
  return sendCreated(res, out);
});

export const respondSwap = asyncHandler(async (req: Request, res: Response) => {
  const out = await service.respondSwap(
    req.db!,
    actorFrom(req),
    req.params.id as string,
    req.body as SwapRespondInput,
  );
  return sendSuccess(res, out);
});

// ─── Leave ────────────────────────────────────────────────────────────────────

export const listLeaveTypes = asyncHandler(async (req: Request, res: Response) => {
  const out = await service.listMyLeaveTypes(req.db!, actorFrom(req));
  return res.json({ success: true, ...out });
});

export const listLeaveBalance = asyncHandler(async (req: Request, res: Response) => {
  const out = await service.listMyLeaveBalance(
    req.db!,
    actorFrom(req),
    req.query as unknown as LeaveBalanceQueryInput,
  );
  return res.json({ success: true, ...out });
});

export const listLeaveRequests = asyncHandler(async (req: Request, res: Response) => {
  const out = await service.listMyLeaveRequests(
    req.db!,
    actorFrom(req),
    req.query as unknown as LeaveRequestListInput,
  );
  return res.json({ success: true, ...out });
});

export const applyLeave = asyncHandler(async (req: Request, res: Response) => {
  const out = await service.applyLeave(req.db!, actorFrom(req), req.body as LeaveApplyInput);
  return sendCreated(res, out);
});

export const cancelLeave = asyncHandler(async (req: Request, res: Response) => {
  const out = await service.cancelMyLeave(req.db!, actorFrom(req), req.params.id as string);
  return sendSuccess(res, out);
});

// ─── Payslips ─────────────────────────────────────────────────────────────────

export const listPayslips = asyncHandler(async (req: Request, res: Response) => {
  const out = await service.listMyPayslips(
    req.db!,
    actorFrom(req),
    req.query as unknown as PayslipListInput,
  );
  return res.json({ success: true, ...out });
});

export const getPayslip = asyncHandler(async (req: Request, res: Response) => {
  const out = await service.getMyPayslip(req.db!, actorFrom(req), req.params.id as string);
  return sendSuccess(res, out);
});

// ESS-scope payslip PDF (printable HTML).
// Self-only — the underlying payroll service enforces ownership.
export const getPayslipPdf = asyncHandler(async (req: Request, res: Response) => {
  const html = await service.getMyPayslipHtml(req.db!, actorFrom(req), req.params.id as string);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

// List own employee documents (confidential
// docs hidden). Doc F §28.17.
export const listDocuments = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.listMyDocuments(req.db!, actorFrom(req), req.query as never);
  return res.json({ success: true, ...result });
});

// ─── Holidays ─────────────────────────────────────────────────────────────────

export const listHolidays = asyncHandler(async (req: Request, res: Response) => {
  const out = await service.listMyHolidays(
    req.db!,
    actorFrom(req),
    req.query as unknown as HolidaysQueryInput,
  );
  return sendSuccess(res, out);
});

// ─── Dashboard ────────────────────────────────────────────────────────────────

export const dashboard = asyncHandler(async (req: Request, res: Response) => {
  const out = await service.getDashboard(req.db!, actorFrom(req));
  return sendSuccess(res, out);
});
