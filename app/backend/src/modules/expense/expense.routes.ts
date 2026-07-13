import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { tenantContext } from "../../middleware/tenantContext";
import { authorize } from "../../middleware/authorize";
import { storeGuard } from "../../middleware/storeGuard";
import { PERMISSIONS } from "../../shared/types/enums";
import * as ctrl from "./expense.controller";

const router = Router();

router.use(authenticate, tenantContext);

// ── Categories ──────────────────────────────────────────────────────────────
router.get("/categories", authorize(PERMISSIONS.EXPENSE_READ), ctrl.listCategories);
router.post("/categories", authorize(PERMISSIONS.EXPENSE_WRITE), ctrl.createCategory);
router.delete("/categories/:id", authorize(PERMISSIONS.EXPENSE_WRITE), ctrl.deleteCategory);

// ── Summary ─────────────────────────────────────────────────────────────────
router.get("/summary", authorize(PERMISSIONS.EXPENSE_READ), ctrl.getSummary);

// ── Expenses CRUD ───────────────────────────────────────────────────────────
router.get("/", authorize(PERMISSIONS.EXPENSE_READ), ctrl.list);
router.post("/", authorize(PERMISSIONS.EXPENSE_WRITE), storeGuard, ctrl.create);
router.get("/:id", authorize(PERMISSIONS.EXPENSE_READ), ctrl.getById);
router.patch("/:id", authorize(PERMISSIONS.EXPENSE_WRITE), ctrl.update);
router.delete("/:id", authorize(PERMISSIONS.EXPENSE_WRITE), ctrl.remove);

export default router;
