import { Request, Response, NextFunction } from "express";
import * as service from "./device-profile.service";
import type {
  CreateDeviceProfileInput,
  UpdateDeviceProfileInput,
  DeviceProfileIdInput,
} from "./device-profile.validation";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.listDeviceProfiles(req.db!);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.createDeviceProfile(
      req.db!,
      req.tenantId!,
      req.body as CreateDeviceProfileInput,
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as unknown as DeviceProfileIdInput;
    const data = await service.updateDeviceProfile(
      req.db!,
      id,
      req.body as UpdateDeviceProfileInput,
    );
    if (!data) {
      res.status(404).json({ success: false, error: { message: "Device profile not found" } });
      return;
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as unknown as DeviceProfileIdInput;
    await service.deleteDeviceProfile(req.db!, id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
