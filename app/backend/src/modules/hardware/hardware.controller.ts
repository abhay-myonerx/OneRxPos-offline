import { Request, Response } from "express";
import {
  printReceiptToDevice,
  openCashDrawerToDevice,
  readWeightFromDevice,
  type DeviceConnection,
} from "./device-io";
import type {
  PrintReceiptInput,
  OpenDrawerInput,
  ScaleReadInput,
} from "./hardware.validation";
import { discoverDevices } from "./device-discovery";

// Normalize the request destination to a DeviceConnection: prefer an explicit
// transport-aware `connection`; otherwise map the legacy network `target`.
function toConnection(body: {
  connection?: DeviceConnection;
  target?: { ip: string; port: number; timeoutMs?: number };
}): DeviceConnection {
  if (body.connection) return body.connection;
  const t = body.target!;
  return { kind: "network", ip: t.ip, port: t.port, timeoutMs: t.timeoutMs };
}

// POST /api/v1/hardware/print
// A printer that is offline/unreachable is an UPSTREAM device failure, not a
// client error → 502 with the reason (fail-closed + loud, never silent).
export async function print(req: Request, res: Response) {
  const body = req.body as PrintReceiptInput;
  try {
    await printReceiptToDevice(body.job, toConnection(body));
    res.json({ success: true, data: { ok: true } });
  } catch (err) {
    res.status(502).json({
      success: false,
      error: { message: err instanceof Error ? err.message : "Print failed" },
    });
  }
}

// POST /api/v1/hardware/drawer/open
export async function openDrawer(req: Request, res: Response) {
  const body = req.body as OpenDrawerInput;
  try {
    await openCashDrawerToDevice(toConnection(body));
    res.json({ success: true, data: { ok: true } });
  } catch (err) {
    res.status(502).json({
      success: false,
      error: { message: err instanceof Error ? err.message : "Drawer open failed" },
    });
  }
}

// GET /api/v1/hardware/devices — enumerate locally-attached COM ports + HID
// devices so the settings UI can offer a pick-list. Never throws (fail-soft per
// category); returns empty lists where a native enumerator is unavailable.
export async function discover(_req: Request, res: Response) {
  const devices = await discoverDevices();
  res.json({ success: true, data: devices });
}

// POST /api/v1/hardware/scale/read
export async function readScale(req: Request, res: Response) {
  const body = req.body as ScaleReadInput;
  try {
    const reading = await readWeightFromDevice(toConnection(body));
    res.json({ success: true, data: reading });
  } catch (err) {
    res.status(502).json({
      success: false,
      error: { message: err instanceof Error ? err.message : "Scale read failed" },
    });
  }
}
