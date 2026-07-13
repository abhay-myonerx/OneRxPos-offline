// Thin HTTP layer for the /messaging API: test-send, audit log, resend.

import { Request, Response } from "express";

import { asyncHandler, sendSuccess } from "../../shared/utils";
import { buildPrismaListQuery, formatListResponse } from "../../shared/utils/listQuery";
import { NotFoundError } from "../../shared/errors";

import { enqueue, loadTenantContext } from "./messaging.service";
import { drainMessages } from "./outbox-drainer";
import { renderTestEmailHtml } from "./messaging.render";

const searchableFields = ["toAddress", "subject"] as const;

/** Attempts an immediate delivery of already-queued rows for this tenant, then
 *  returns the (possibly updated) row by id. Used by test-send + resend so the
 *  operator gets synchronous feedback instead of waiting for the interval. */
async function sendNowAndReload(req: Request, tenant: Awaited<ReturnType<typeof loadTenantContext>>, id: string) {
  await drainMessages(req.db!, async () => tenant);
  const row = await req.db!.messageLog.findUnique({ where: { id } });
  return row;
}

export const sendTest = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const tenant = await loadTenantContext(req.db!, tenantId);
  const to = (req.body as { to: string }).to;

  const enqueued = await enqueue(req.db!, tenant, {
    tenantId,
    kind: "TEST",
    to: { email: to },
    subject: "RX POS — test email",
    html: renderTestEmailHtml(null),
    createdBy: req.user!.id,
  });

  const row = await sendNowAndReload(req, tenant, enqueued.id as string);
  return sendSuccess(res, row ?? enqueued);
});

export const listLog = asyncHandler(async (req: Request, res: Response) => {
  const { status, kind, ...rest } = req.query as Record<string, unknown>;
  const extraWhere: Record<string, unknown> = {};
  if (status !== undefined) extraWhere.status = status;
  if (kind !== undefined) extraWhere.kind = kind;

  const { where, orderBy, skip, take, meta } = buildPrismaListQuery(rest as never, {
    searchableFields,
    extraWhere,
  });

  const [data, total] = await Promise.all([
    req.db!.messageLog.findMany({ where, orderBy, skip, take }),
    req.db!.messageLog.count({ where }),
  ]);
  return res.json({ success: true, ...formatListResponse(data, total, meta) });
});

export const resend = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const existing = await req.db!.messageLog.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("MessageLog", id);

  await req.db!.messageLog.update({
    where: { id },
    data: { status: "QUEUED", attempts: 0, nextAttemptAt: new Date(), lastError: null },
  });

  const tenant = await loadTenantContext(req.db!, req.user!.tenantId);
  const row = await sendNowAndReload(req, tenant, id);
  return sendSuccess(res, row);
});
