import { Request, Response, NextFunction } from "express";
import { createLicensingService } from "./licensing.service";
import { prismaLicenseRepo } from "./licensing.repo";
import { activateSchema, validateSchema } from "./licensing.validation";
import { config } from "../../config";
import { getLocalDb } from "@/local/database";
import { deriveLocalDbKey } from "@/local/key-derivation";
import { getDeviceFingerprint } from "@/licensing/fingerprint";
import { readLicenseStatus } from "@/licensing/status";

const service = createLicensingService(prismaLicenseRepo);

export async function activateController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = activateSchema.parse(req.body);
    const data = await service.activate(parsed);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function validateController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = validateSchema.parse(req.body);
    const data = await service.validate(parsed);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// GET /status — reads THIS till's own local encrypted DB state; only
// meaningful on a store-node with LOCAL_DB_MASTER_KEY configured. On a
// pure cloud deployment it surfaces the standard DB-not-configured error,
// which is acceptable for 0.5.
export async function statusController(_req: Request, res: Response, next: NextFunction) {
  try {
    const db = getLocalDb();
    const key = deriveLocalDbKey(config.LOCAL_DB_MASTER_KEY!, config.SYNC_DEVICE_ID);
    const data = readLicenseStatus(db, key, {
      hasKey: !!config.LICENSE_KEY,
      now: Date.now(),
      degradeDays: config.LICENSE_DEGRADE_DAYS,
      lockoutDays: config.LICENSE_LOCKOUT_DAYS,
      fingerprint: await getDeviceFingerprint(),
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
