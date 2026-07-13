// Thin HTTP layer for the HRM Designation module.

import { Request, Response } from "express";

import { asyncHandler, sendCreated, sendSuccess } from "../../shared/utils";

import * as service from "./designation.service";

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.list(req.db!, req.query as never);
  return res.json({ success: true, ...result });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.getById(req.db!, req.params.id as string);
  return sendSuccess(res, row);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.create(req.db!, req.user!, req.body);
  return sendCreated(res, row);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.update(req.db!, req.user!, req.params.id as string, req.body);
  return sendSuccess(res, row);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.deactivate(req.db!, req.user!, req.params.id as string);
  return sendSuccess(res, row);
});

export const restore = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.restore(req.db!, req.user!, req.params.id as string);
  return sendSuccess(res, row);
});
