// Thin HTTP layer for the in-app notification module.

import { Request, Response } from "express";

import { asyncHandler, sendSuccess } from "../../shared/utils";
import { NotFoundError } from "../../shared/errors";
import type { Role, NotificationType } from "../../generated/prisma/enums";

import * as service from "./notification.service";
import type { BroadcastInput } from "./notification.validation";

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.listForUser(req.db!, req.user!.id, req.query as never);
  return res.json({ success: true, ...result });
});

export const unreadCount = asyncHandler(async (req: Request, res: Response) => {
  const count = await service.unreadCount(req.db!, req.user!.id);
  return sendSuccess(res, { count });
});

export const markRead = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.markRead(req.db!, req.user!.id, req.params.id as string);
  if (!row) throw new NotFoundError("Notification", req.params.id as string);
  return sendSuccess(res, row);
});

export const markAllRead = asyncHandler(async (req: Request, res: Response) => {
  const count = await service.markAllRead(req.db!, req.user!.id);
  return sendSuccess(res, { updated: count });
});

export const broadcast = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as BroadcastInput;
  const tenantId = req.user!.tenantId;

  const content = {
    type: input.type as NotificationType,
    title: input.title,
    body: input.body,
    link: input.link ?? null,
    data: input.data ?? {},
  };

  if (input.tenantWide) {
    await service.notifyTenant(tenantId, content);
  } else if (input.storeId) {
    await service.notifyStore(tenantId, input.storeId, content);
  } else if (input.roles) {
    await service.notifyRoles(tenantId, input.roles as Role[], content);
  }

  return sendSuccess(res, { queued: true }, 202);
});
