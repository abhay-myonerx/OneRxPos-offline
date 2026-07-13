import { Request, Response } from "express";

import { asyncHandler, sendCreated, sendSuccess } from "../../shared/utils";

import * as service from "./attendance.service";
import * as correctionService from "./attendance.correction.service";

const actorFrom = (req: Request) => ({
  id: req.user!.id,
  tenantId: req.user!.tenantId,
  role: req.user!.role as string,
});

// ─── Punch endpoints ───────────────────────────────────────────────────────────

export const checkIn = asyncHandler(async (req: Request, res: Response) => {
  const out = await service.punch(req.db!, actorFrom(req), "CHECK_IN", req.body, {
    ipAddress: req.ip ?? null,
  });
  return sendCreated(res, out);
});

export const checkOut = asyncHandler(async (req: Request, res: Response) => {
  const out = await service.punch(req.db!, actorFrom(req), "CHECK_OUT", req.body, {
    ipAddress: req.ip ?? null,
  });
  return sendCreated(res, out);
});

export const breakStart = asyncHandler(async (req: Request, res: Response) => {
  const out = await service.punch(req.db!, actorFrom(req), "BREAK_START", req.body, {
    ipAddress: req.ip ?? null,
  });
  return sendCreated(res, out);
});

export const breakEnd = asyncHandler(async (req: Request, res: Response) => {
  const out = await service.punch(req.db!, actorFrom(req), "BREAK_END", req.body, {
    ipAddress: req.ip ?? null,
  });
  return sendCreated(res, out);
});

// ─── Reads ─────────────────────────────────────────────────────────────────────

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.list(req.db!, actorFrom(req), req.query as never);
  return res.json({ success: true, ...result });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.getById(req.db!, actorFrom(req), req.params.id as string);
  return sendSuccess(res, row);
});

export const today = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.getToday(req.db!, actorFrom(req));
  return sendSuccess(res, row);
});

export const summary = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.getSummary(req.db!, actorFrom(req), req.query as never);
  return sendSuccess(res, row);
});

// ─── Corrections ───────────────────────────────────────────────────────────────

export const correctionsList = asyncHandler(async (req: Request, res: Response) => {
  const result = await correctionService.list(req.db!, actorFrom(req), req.query as never);
  return res.json({ success: true, ...result });
});

export const correctionsRequest = asyncHandler(async (req: Request, res: Response) => {
  const row = await correctionService.request(req.db!, actorFrom(req), req.body);
  return sendCreated(res, row);
});

export const correctionsGetById = asyncHandler(async (req: Request, res: Response) => {
  const row = await correctionService.getById(req.db!, actorFrom(req), req.params.id as string);
  return sendSuccess(res, row);
});

export const correctionsApprove = asyncHandler(async (req: Request, res: Response) => {
  const row = await correctionService.approve(
    req.db!,
    actorFrom(req),
    req.params.id as string,
    req.body ?? {},
  );
  return sendSuccess(res, row);
});

export const correctionsReject = asyncHandler(async (req: Request, res: Response) => {
  const row = await correctionService.reject(
    req.db!,
    actorFrom(req),
    req.params.id as string,
    req.body ?? {},
  );
  return sendSuccess(res, row);
});

export const correctionsCancel = asyncHandler(async (req: Request, res: Response) => {
  const row = await correctionService.cancelOwn(req.db!, actorFrom(req), req.params.id as string);
  return sendSuccess(res, row);
});
