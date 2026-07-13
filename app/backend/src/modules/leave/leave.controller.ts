// Thin adapters between routes and leave service.
import { Request, Response } from "express";

import { asyncHandler, sendCreated, sendSuccess } from "../../shared/utils";

import * as service from "./leave.service";

const actorFrom = (req: Request) => ({
  id: req.user!.id,
  tenantId: req.user!.tenantId,
  role: req.user!.role as string,
});

// ─── Leave Types ───────────────────────────────────────────────────────────────

export const listLeaveTypes = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.listLeaveTypes(req.db!, actorFrom(req), req.query as never);
  return res.json({ success: true, ...result });
});

export const getLeaveType = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.getLeaveTypeById(req.db!, actorFrom(req), req.params.id as string);
  return sendSuccess(res, row);
});

export const createLeaveType = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.createLeaveType(req.db!, actorFrom(req), req.body);
  return sendCreated(res, row);
});

export const updateLeaveType = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.updateLeaveType(
    req.db!,
    actorFrom(req),
    req.params.id as string,
    req.body,
  );
  return sendSuccess(res, row);
});

export const deactivateLeaveType = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.deactivateLeaveType(req.db!, actorFrom(req), req.params.id as string);
  return sendSuccess(res, row);
});

export const reactivateLeaveType = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.reactivateLeaveType(req.db!, actorFrom(req), req.params.id as string);
  return sendSuccess(res, row);
});

// ─── Leave Policies ────────────────────────────────────────────────────────────

export const listPolicies = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.listLeavePolicies(req.db!, actorFrom(req), req.query as never);
  return res.json({ success: true, ...result });
});

export const createPolicy = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.createLeavePolicy(req.db!, actorFrom(req), req.body);
  return sendCreated(res, row);
});

export const updatePolicy = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.updateLeavePolicy(
    req.db!,
    actorFrom(req),
    req.params.id as string,
    req.body,
  );
  return sendSuccess(res, row);
});

// ─── Leave Balances ────────────────────────────────────────────────────────────

export const listBalances = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.listLeaveBalances(req.db!, actorFrom(req), req.query as never);
  return res.json({ success: true, ...result });
});

export const adjustBalance = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.adjustLeaveBalance(req.db!, actorFrom(req), req.body);
  return sendSuccess(res, row);
});

// ─── Leave Requests ────────────────────────────────────────────────────────────

export const listRequests = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.listLeaveRequests(req.db!, actorFrom(req), req.query as never);
  return res.json({ success: true, ...result });
});

export const getRequest = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.getLeaveRequestById(req.db!, actorFrom(req), req.params.id as string);
  return sendSuccess(res, row);
});

export const createRequest = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.createLeaveRequest(req.db!, actorFrom(req), req.body);
  return sendCreated(res, row);
});

export const updateRequest = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.updateLeaveRequest(
    req.db!,
    actorFrom(req),
    req.params.id as string,
    req.body,
  );
  return sendSuccess(res, row);
});

export const approveRequest = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.approveLeaveRequest(
    req.db!,
    actorFrom(req),
    req.params.id as string,
    req.body,
  );
  return sendSuccess(res, row);
});

export const rejectRequest = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.rejectLeaveRequest(
    req.db!,
    actorFrom(req),
    req.params.id as string,
    req.body,
  );
  return sendSuccess(res, row);
});

export const cancelRequest = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.cancelLeaveRequest(req.db!, actorFrom(req), req.params.id as string);
  return sendSuccess(res, row);
});
