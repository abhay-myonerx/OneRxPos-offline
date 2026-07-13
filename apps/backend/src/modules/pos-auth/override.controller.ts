import { Request, Response, NextFunction } from "express";

import { requestOverride, runConsumeOverride } from "./override.service";
import { requestOverrideSchema, type ConsumeOverrideInput } from "./override.validation";

// POST /api/v2/pos/override — inline-PIN manager override. The route only
// requires `authenticate` (no `tenantContext`/`authorize`): the CALLER is a
// cashier who lacks a gated action's permission, so gating on the caller's
// own role/permission would defeat the point. Instead the body names an
// AUTHORIZER (`authorizerUserId`) whose PIN + permission are what get
// checked — `requestOverride` takes the caller's `req.tenantId` to confirm
// the authorizer belongs to the SAME tenant (cross-tenant IDOR guard) and
// as the audit fallback tenant for pre-tenant-resolution rejections, and
// `req.user!.id` to record who REQUESTED the override in the audit trail
// (distinct from who authorized it) — never to grant the caller anything
// directly.
export async function requestOverrideController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = requestOverrideSchema.parse(req.body);

    const grant = await requestOverride(parsed, req.tenantId!, req.user!.id);

    res.json({ success: true, data: { grant } });
  } catch (err) {
    next(err);
  }
}

// POST /api/v2/pos/override/consume — verify + consume + audit a manager
// override grant for a PRE-checkout gated action (void line, clear
// transaction) that never reaches a persisted sale, so it must be audited
// at action time rather than riding along on a sale's own audit trail. The
// route validates the body with `validate(consumeOverrideSchema)`, so
// `req.body` is already the parsed `ConsumeOverrideInput` here. Only
// `authenticate` in front (same as `/override`) — any authenticated
// (cashier) session may consume a grant it already holds; the grant's own
// signature/expiry/action+context binding is what's actually gating.
export async function consumeOverrideController(req: Request, res: Response, next: NextFunction) {
  try {
    const { action, context, grant } = req.body as ConsumeOverrideInput;

    const consumed = await runConsumeOverride({
      grant,
      action,
      context,
      cashierUserId: req.user!.id,
      tenantId: req.user!.tenantId,
    });

    if (!consumed) {
      res.status(400).json({ consumed: false });
      return;
    }

    res.json({ consumed: true });
  } catch (err) {
    next(err);
  }
}
