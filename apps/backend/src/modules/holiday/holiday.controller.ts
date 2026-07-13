// Thin adapters between routes and holiday service.
import { Request, Response } from "express";

import { asyncHandler, sendCreated, sendSuccess } from "../../shared/utils";

import * as service from "./holiday.service";

const actorFrom = (req: Request) => ({
  id: req.user!.id,
  tenantId: req.user!.tenantId,
  role: req.user!.role as string,
});

export const listHolidays = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.listHolidays(req.db!, actorFrom(req), req.query as never);
  return res.json({ success: true, ...result });
});

export const getHoliday = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.getHolidayById(req.db!, actorFrom(req), req.params.id as string);
  return sendSuccess(res, row);
});

export const createHoliday = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.createHoliday(req.db!, actorFrom(req), req.body);
  return sendCreated(res, row);
});

export const updateHoliday = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.updateHoliday(
    req.db!,
    actorFrom(req),
    req.params.id as string,
    req.body,
  );
  return sendSuccess(res, row);
});

export const deactivateHoliday = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.deactivateHoliday(req.db!, actorFrom(req), req.params.id as string);
  return sendSuccess(res, row);
});

export const importPreset = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.importPreset(req.db!, actorFrom(req), req.body);
  return sendCreated(res, result);
});

export const getCalendar = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.getCalendar(req.db!, actorFrom(req), req.query as never);
  return sendSuccess(res, result);
});
