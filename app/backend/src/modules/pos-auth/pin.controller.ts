import { Request, Response, NextFunction } from "express";

import { recordAudit } from "@/shared/utils/auditLog";

import { setPin, resetPin, pinLogin } from "./pin.service";
import { setPinSchema, pinLoginSchema } from "./pin.validation";

export async function setPinController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = setPinSchema.parse(req.body);
    const userId = req.user!.id;

    await setPin(userId, parsed.pin);

    await recordAudit({
      req,
      action: "USER_PIN_SET",
      entityType: "UserPin",
      entityId: userId,
    });

    res.json({ success: true, data: { userId, set: true } });
  } catch (err) {
    next(err);
  }
}

export async function resetPinController(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;

    await resetPin(id, req.tenantId!);

    await recordAudit({
      req,
      action: "USER_PIN_RESET",
      entityType: "UserPin",
      entityId: id,
    });

    res.json({ success: true, data: { id, reset: true } });
  } catch (err) {
    next(err);
  }
}

// POST /api/v2/pos/pin-login — PIN quick-login. No `authenticate`/
// `tenantContext` in front of this route: this endpoint IS the login, so
// there is no session yet to pull a tenant from. `pinLogin` resolves the
// tenant itself from the globally-unique `userId` (see pin.service.ts)
// and never trusts a tenant from the request.
export async function pinLoginController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = pinLoginSchema.parse(req.body);

    const tokens = await pinLogin(parsed);

    res.json({ success: true, data: tokens });
  } catch (err) {
    next(err);
  }
}
