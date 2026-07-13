// Product & Category routes

import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { tenantContext } from "../../middleware/tenantContext";
import { authorize } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import { PERMISSIONS } from "../../shared/types/enums";
import {
  createProductSchema,
  updateProductSchema,
  upsertVariantSchema,
  bulkImportSchema,
  createCategorySchema,
  updateCategorySchema,
} from "./product.validation";
import * as productController from "./product.controller";
import * as categoryController from "./category.controller";
import * as drugController from "../drug/drug.controller";
import * as productSupplierController from "./product-supplier.controller";
import {
  productIdParamSchema,
  linkProductDrugSchema,
  scheduleOverrideSchema,
} from "../drug/drug.validation";
import {
  addVendorSchema,
  updateVendorSchema,
  vendorParamsSchema,
  productIdOnlyParamsSchema as vendorProductIdParams,
} from "./product-supplier.validation";

const router = Router();

router.use(authenticate, tenantContext);

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORIES  (nested under /products/categories)
// ═══════════════════════════════════════════════════════════════════════════

// GET    /api/v1/products/categories          — List (tree or flat)
router.get("/categories", authorize("category:read"), categoryController.list);

// POST   /api/v1/products/categories          — Create category
router.post(
  "/categories",
  authorize("category:write"),
  validate(createCategorySchema),
  categoryController.create,
);

// GET    /api/v1/products/categories/:id      — Get category
router.get("/categories/:id", authorize("category:read"), categoryController.getById);

// PATCH  /api/v1/products/categories/:id      — Update category
router.patch(
  "/categories/:id",
  authorize("category:write"),
  validate(updateCategorySchema),
  categoryController.update,
);

// DELETE /api/v1/products/categories/:id      — Soft-delete category
router.delete("/categories/:id", authorize("category:write"), categoryController.remove);

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCTS
// ═══════════════════════════════════════════════════════════════════════════

// GET    /api/v1/products                     — List products
router.get("/", authorize("product:read"), productController.list);

// POST   /api/v1/products                     — Create product
router.post(
  "/",
  authorize("product:write"),
  validate(createProductSchema),
  productController.create,
);

// POST   /api/v1/products/bulk-import         — Bulk import
router.post(
  "/bulk-import",
  authorize("product:write"),
  validate(bulkImportSchema),
  productController.bulkImport,
);

// GET    /api/v1/products/lookup/barcode/:barcode — Lookup by barcode (POS scanner)
router.get(
  "/lookup/barcode/:barcode",
  authorize("product:read"),
  productController.lookupByBarcode,
);

// GET    /api/v1/products/misc                — Ensure + return the tenant's
//                                                 "Miscellaneous" open-price
//                                                 product id (Phase 1.3a).
//                                                 Must be registered BEFORE
//                                                 the "/:id" route below so
//                                                 "misc" isn't swallowed as
//                                                 a product id param.
router.get("/misc", authorize(PERMISSIONS.SALE_CREATE), productController.misc);

// GET    /api/v1/products/:id                 — Get product detail
router.get("/:id", authorize("product:read"), productController.getById);

// PATCH  /api/v1/products/:id                 — Update product
router.patch(
  "/:id",
  authorize("product:write"),
  validate(updateProductSchema),
  productController.update,
);

// DELETE /api/v1/products/:id                 — Soft-delete product
router.delete("/:id", authorize("product:write"), productController.remove);

// ── Variant sub-routes ──────────────────────────────────────────────────────

// POST   /api/v1/products/:id/variants            — Add variant
router.post(
  "/:id/variants",
  authorize("product:write"),
  validate(upsertVariantSchema),
  productController.addVariant,
);

// PATCH  /api/v1/products/:id/variants/:variantId — Update variant
router.patch(
  "/:id/variants/:variantId",
  authorize("product:write"),
  validate(upsertVariantSchema),
  productController.updateVariant,
);

// DELETE /api/v1/products/:id/variants/:variantId — Soft-delete variant
router.delete(
  "/:id/variants/:variantId",
  authorize("product:write"),
  productController.deleteVariant,
);

// ── Drug identity sub-routes (Phase 2.1) ────────────────────────────────────
// Link/unlink a DIN and set a schedule override on a product. ADMIN-gated
// (SETTINGS_MANAGE — only ADMIN/SUPER_ADMIN hold it; a cashier gets 403), and
// tenant-scoped via `req.db`. Handlers live in the drug module.

// PUT /api/v1/products/:id/drug              — link / unlink a DIN
router.put(
  "/:id/drug",
  authorize(PERMISSIONS.SETTINGS_MANAGE),
  validate(productIdParamSchema, "params"),
  validate(linkProductDrugSchema),
  drugController.linkDrug,
);

// PUT /api/v1/products/:id/schedule-override — set / clear a schedule override
router.put(
  "/:id/schedule-override",
  authorize(PERMISSIONS.SETTINGS_MANAGE),
  validate(productIdParamSchema, "params"),
  validate(scheduleOverrideSchema),
  drugController.setScheduleOverride,
);

// ── Vendor (multi-supplier) sub-routes (3H.2) ───────────────────────────────
// Per-product supplier links: per-vendor cost/SKU/lead-time + preferred flag.
router.get("/:id/vendors", authorize("product:read"), validate(vendorProductIdParams, "params"), productSupplierController.listVendors);
router.post("/:id/vendors", authorize("product:write"), validate(vendorProductIdParams, "params"), validate(addVendorSchema), productSupplierController.addVendor);
router.patch("/:id/vendors/:supplierId", authorize("product:write"), validate(vendorParamsSchema, "params"), validate(updateVendorSchema), productSupplierController.updateVendor);
router.delete("/:id/vendors/:supplierId", authorize("product:write"), validate(vendorParamsSchema, "params"), productSupplierController.removeVendor);
router.post("/:id/vendors/:supplierId/prefer", authorize("product:write"), validate(vendorParamsSchema, "params"), productSupplierController.prefer);

export default router;
