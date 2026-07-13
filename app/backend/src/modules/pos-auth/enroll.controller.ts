import { Request, Response, NextFunction } from "express";

import { recordAudit } from "@/shared/utils/auditLog";

import { enrollDevice, revokeDevice } from "./enroll.service";
import { enrollSchema } from "./enroll.validation";

export async function enrollController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = enrollSchema.parse(req.body);
    const tenantId = req.tenantId!;
    const device = await enrollDevice({
      tenantId,
      storeId: parsed.storeId,
      fingerprint: parsed.fingerprint,
      name: parsed.name,
      byUserId: req.user!.id,
    });

    await recordAudit({
      req,
      action: "DEVICE_ENROLLED",
      entityType: "EnrolledDevice",
      entityId: device.id,
      newData: device,
    });

    res.json({ success: true, data: device });
  } catch (err) {
    next(err);
  }
}

export async function revokeController(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const tenantId = req.tenantId!;

    await revokeDevice(id, tenantId);

    await recordAudit({
      req,
      action: "DEVICE_REVOKED",
      entityType: "EnrolledDevice",
      entityId: id,
    });

    res.json({ success: true, data: { id, revoked: true } });
  } catch (err) {
    next(err);
  }
}
