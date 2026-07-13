import { Request, Response, NextFunction } from "express";
import * as syncService from "./sync.service";
import { pushBodySchema } from "./sync.validation";

// ── POST /api/v2/sync/push ───────────────────────────────────────────────────

export async function pushController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = pushBodySchema.parse(req.body);
    const data = syncService.applyPush(parsed.events, req.syncContext!);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/v2/sync/status ──────────────────────────────────────────────────

export async function statusController(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: { ok: true, serverTime: new Date().toISOString() } });
  } catch (err) {
    next(err);
  }
}
