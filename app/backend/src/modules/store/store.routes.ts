// Store routes — CRUD, settings, stats

import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { tenantContext } from "../../middleware/tenantContext";
import { authorize } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import {
  createStoreSchema,
  updateStoreSchema,
  updateStoreSettingsSchema,
} from "./store.validation";
import * as controller from "./store.controller";

const router = Router();

// All store routes require authentication + tenant context
router.use(authenticate, tenantContext);

// GET  /api/v1/stores            — List stores
router.get("/", authorize("store:manage"), controller.list);

// POST /api/v1/stores            — Create a new store
router.post("/", authorize("store:manage"), validate(createStoreSchema), controller.create);

// GET  /api/v1/stores/:id        — Get store details
router.get("/:id", authorize("store:manage"), controller.getById);

// PATCH /api/v1/stores/:id       — Update store
router.patch("/:id", authorize("store:manage"), validate(updateStoreSchema), controller.update);

// PATCH /api/v1/stores/:id/settings — Update store settings
router.patch(
  "/:id/settings",
  authorize("store:manage"),
  validate(updateStoreSettingsSchema),
  controller.updateSettings,
);

// GET  /api/v1/stores/:id/stats  — Per-store dashboard stats
router.get("/:id/stats", authorize("store:manage"), controller.getStats);

// DELETE /api/v1/stores/:id      — Soft-delete (deactivate) store
router.delete("/:id", authorize("store:manage"), controller.remove);

export default router;
