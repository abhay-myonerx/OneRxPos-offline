// Thin HTTP adapters for the v2 reporting endpoints.
import { Request, Response } from "express";

import { asyncHandler, sendSuccess } from "@/shared/utils";

import * as service from "./v2-report.service";

export const dashboard = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.getDashboardSummary(req.db!, req.query as never);
  return sendSuccess(res, data);
});

export const employees = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.getEmployeeSummary(req.db!, req.query as never);
  return sendSuccess(res, data);
});

export const attendance = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.getAttendanceSummary(req.db!, req.query as never);
  return sendSuccess(res, data);
});

export const leave = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.getLeaveSummary(req.db!, req.query as never);
  return sendSuccess(res, data);
});

export const payroll = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.getPayrollSummary(req.db!, req.query as never);
  return sendSuccess(res, data);
});

export const activity = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.getRecentActivity(req.db!, req.query as never);
  return sendSuccess(res, data);
});
