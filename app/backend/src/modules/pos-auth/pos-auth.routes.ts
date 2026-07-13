// Barrel for the `/api/v2/pos` mount — composes the pos-auth feature's
// sub-routers (enrollment, PIN set/reset/quick-login, inline-PIN manager
// override) so the whole feature shares one mount point in `app.ts`.

import { Router } from "express";

import enrollRoutes from "./enroll.routes";
import pinRoutes from "./pin.routes";
import overrideRoutes from "./override.routes";
import parkedSaleRoutes from "./parked-sale.routes";

const router = Router();

router.use(enrollRoutes);
router.use(pinRoutes);
router.use(overrideRoutes);
router.use(parkedSaleRoutes);

export default router;
