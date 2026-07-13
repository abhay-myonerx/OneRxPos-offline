// Thin adapters between routes and services for the HRM Shifts module
// All business logic lives in `shift.service.ts` /
// `shift-swap.service.ts`.

import { Request, Response } from "express";

import { asyncHandler, sendCreated, sendSuccess } from "../../shared/utils";

import * as service from "./shift.service";
import * as swapService from "./shift-swap.service";

const actorFrom = (req: Request) => ({
  id: req.user!.id,
  tenantId: req.user!.tenantId,
  role: req.user!.role as string,
});

// ─── WorkShift templates ───────────────────────────────────────────────────────

export const listTemplates = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.listTemplates(req.db!, actorFrom(req), req.query as never);
  return res.json({ success: true, ...result });
});

export const getTemplate = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.getTemplateById(req.db!, actorFrom(req), req.params.id as string);
  return sendSuccess(res, row);
});

export const createTemplate = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.createTemplate(req.db!, actorFrom(req), req.body);
  return sendCreated(res, row);
});

export const updateTemplate = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.updateTemplate(
    req.db!,
    actorFrom(req),
    req.params.id as string,
    req.body,
  );
  return sendSuccess(res, row);
});

export const deactivateTemplate = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.deactivateTemplate(req.db!, actorFrom(req), req.params.id as string);
  return sendSuccess(res, row);
});

export const reactivateTemplate = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.reactivateTemplate(req.db!, actorFrom(req), req.params.id as string);
  return sendSuccess(res, row);
});

// ─── ShiftSchedule (roster) ────────────────────────────────────────────────────

export const listSchedules = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.listSchedules(req.db!, actorFrom(req), req.query as never);
  return res.json({ success: true, ...result });
});

export const createBulkSchedule = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.createBulkSchedule(req.db!, actorFrom(req), req.body);
  // 201 even when some rows conflicted — the call is partially
  // successful by design (§7.1 wire shape). Frontend reads
  // `result.created` + `result.conflicts`.
  return sendCreated(res, result);
});

export const updateSchedule = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.updateSchedule(
    req.db!,
    actorFrom(req),
    req.params.id as string,
    req.body,
  );
  return sendSuccess(res, row);
});

export const cancelSchedule = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.cancelSchedule(req.db!, actorFrom(req), req.params.id as string);
  return sendSuccess(res, row);
});

// ─── Swap workflow ─────────────────────────────────────────────────────────────

export const listSwaps = asyncHandler(async (req: Request, res: Response) => {
  const result = await swapService.listSwaps(req.db!, actorFrom(req), req.query as never);
  return res.json({ success: true, ...result });
});

export const getSwap = asyncHandler(async (req: Request, res: Response) => {
  const row = await swapService.getSwap(req.db!, actorFrom(req), req.params.id as string);
  return sendSuccess(res, row);
});

export const requestSwap = asyncHandler(async (req: Request, res: Response) => {
  const row = await swapService.requestSwap(req.db!, actorFrom(req), req.body);
  return sendCreated(res, row);
});

export const respondPeer = asyncHandler(async (req: Request, res: Response) => {
  const row = await swapService.respondPeer(
    req.db!,
    actorFrom(req),
    req.params.id as string,
    req.body,
  );
  return sendSuccess(res, row);
});

export const approveManager = asyncHandler(async (req: Request, res: Response) => {
  const result = await swapService.approveManager(
    req.db!,
    actorFrom(req),
    req.params.id as string,
    req.body,
  );
  return sendSuccess(res, result);
});

export const cancelSwap = asyncHandler(async (req: Request, res: Response) => {
  const row = await swapService.cancelOwn(req.db!, actorFrom(req), req.params.id as string);
  return sendSuccess(res, row);
});
