import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import { PERMISSIONS } from "../../shared/types/enums";

import * as ctrl from "./hardware.controller";
import { printReceiptSchema, openDrawerSchema, scaleReadSchema } from "./hardware.validation";

const router = Router();

// Physical peripheral I/O. Network printing is reachable by ALL client surfaces
// (desktop web, Android, iOS) because a browser cannot open a raw TCP socket —
// the backend opens it. Auth only: no tenantContext/DB (the caller supplies the
// target; device-profile resolution by deviceId arrives in 2.9.5).
router.use(authenticate);

// POST /api/v1/hardware/print — render a ReceiptJob and send it to a network printer
router.post(
  "/print",
  authorize(PERMISSIONS.RECEIPT_GENERATE),
  validate(printReceiptSchema),
  ctrl.print,
);

// POST /api/v1/hardware/drawer/open — pop a cash drawer chained to a network printer.
// Same permission as receipt printing: any staffer who can complete a cash sale can
// pop the drawer. A dedicated no-sale-pop permission is a noted follow-up.
router.post(
  "/drawer/open",
  authorize(PERMISSIONS.RECEIPT_GENERATE),
  validate(openDrawerSchema),
  ctrl.openDrawer,
);

// GET /api/v1/hardware/devices — list locally-attached COM ports + HID devices
// for the settings pick-list. Auth-only (reads no tenant data, changes nothing).
router.get("/devices", ctrl.discover);

// POST /api/v1/hardware/scale/read — read a live weight from a network scale.
// Auth-only (router-level authenticate): reading a weight changes no state and
// every POS-floor role needs it. A dedicated permission is a noted follow-up.
router.post("/scale/read", validate(scaleReadSchema), ctrl.readScale);

export default router;
