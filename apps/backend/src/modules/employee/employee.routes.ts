import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { tenantContext } from "../../middleware/tenantContext";
import { validate } from "../../middleware/validate";
import { requirePermission } from "../../middleware/requirePermission";
import { moduleEnabled } from "../../middleware/moduleEnabled";
import { MODULE } from "../../shared/settings/enabledModules";
import { PERMISSIONS_V2 } from "../../shared/permissions/v2-permissions";

import * as controller from "./employee.controller";
import {
  createEmployeeSchema,
  idParamSchema,
  linkUserSchema,
  listQuerySchema,
  salaryUpdateSchema,
  sensitiveUpdateSchema,
  terminateEmployeeSchema,
  updateEmployeeSchema,
} from "./employee.validation";
import { contractListQuerySchema, createContractSchema } from "./contracts.validation";
import {
  docIdParamSchema,
  documentListQuerySchema,
  uploadDocumentSchema,
} from "./documents.validation";

const router = Router();

router.use(authenticate, tenantContext, moduleEnabled(MODULE.HR));

router.get(
  "/",
  requirePermission(PERMISSIONS_V2.HR_EMPLOYEES_READ),
  validate(listQuerySchema, "query"),
  controller.list,
);

router.post(
  "/",
  requirePermission(PERMISSIONS_V2.HR_EMPLOYEES_CREATE),
  validate(createEmployeeSchema),
  controller.create,
);

router.get(
  "/:id",
  requirePermission(PERMISSIONS_V2.HR_EMPLOYEES_READ),
  validate(idParamSchema, "params"),
  controller.getById,
);

router.patch(
  "/:id",
  requirePermission(PERMISSIONS_V2.HR_EMPLOYEES_UPDATE),
  validate(idParamSchema, "params"),
  validate(updateEmployeeSchema),
  controller.update,
);

router.delete(
  "/:id",
  requirePermission(PERMISSIONS_V2.HR_EMPLOYEES_UPDATE),
  validate(idParamSchema, "params"),
  controller.remove,
);

router.patch(
  "/:id/restore",
  requirePermission(PERMISSIONS_V2.HR_EMPLOYEES_UPDATE),
  validate(idParamSchema, "params"),
  controller.restore,
);

// POST /api/v2/hr/employees/:id/link-user
//
// Routes accepts either `{ userId }` (link existing) or `{ createUser }`
// (mint + link). The route gate requires `hr.employees.update`; the
// service additionally enforces `users.create` for the createUser
// branch and role-clamps which roles each actor role may mint.
router.post(
  "/:id/link-user",
  requirePermission(PERMISSIONS_V2.HR_EMPLOYEES_UPDATE),
  validate(idParamSchema, "params"),
  validate(linkUserSchema),
  controller.linkUser,
);

// PATCH /api/v2/hr/employees/:id/sensitive
//
// Write encrypted sensitive PII (nationalId,
// passportNumber, taxId, bankDetails). Route gate is the dedicated
// `hr.employees.update.sensitive` permission. Plaintext never
// reaches the audit log.
router.patch(
  "/:id/sensitive",
  requirePermission(PERMISSIONS_V2.HR_EMPLOYEES_UPDATE_SENSITIVE),
  validate(idParamSchema, "params"),
  validate(sensitiveUpdateSchema),
  controller.updateSensitive,
);

// PATCH /api/v2/hr/employees/:id/salary
//
// Effective-dated salary assignment. Thin
// wrapper over POST /payroll/employee-salaries (employee id from
// path instead of body). Route gate is the dedicated
// `hr.employees.update.salary` permission.
router.patch(
  "/:id/salary",
  requirePermission(PERMISSIONS_V2.HR_EMPLOYEES_UPDATE_SALARY),
  validate(idParamSchema, "params"),
  validate(salaryUpdateSchema),
  controller.updateSalary,
);

// POST /api/v2/hr/employees/:id/terminate
//
// Atomic separation cascade (status flip,
// optional user-deactivate + token revoke, PENDING leave cancel,
// future-shift cancel). Route gate is the dedicated
// `hr.employees.terminate` permission.
router.post(
  "/:id/terminate",
  requirePermission(PERMISSIONS_V2.HR_EMPLOYEES_TERMINATE),
  validate(idParamSchema, "params"),
  validate(terminateEmployeeSchema),
  controller.terminate,
);

// ── contracts ────────────────────────────────────
router.get(
  "/:id/contracts",
  requirePermission(PERMISSIONS_V2.HR_CONTRACTS_READ),
  validate(idParamSchema, "params"),
  validate(contractListQuerySchema, "query"),
  controller.listContracts,
);

router.post(
  "/:id/contracts",
  requirePermission(PERMISSIONS_V2.HR_CONTRACTS_CREATE),
  validate(idParamSchema, "params"),
  validate(createContractSchema),
  controller.createContract,
);

// ── documents ────────────────────────────────────
router.get(
  "/:id/documents",
  requirePermission(PERMISSIONS_V2.HR_EMPLOYEES_DOCUMENTS_READ),
  validate(idParamSchema, "params"),
  validate(documentListQuerySchema, "query"),
  controller.listDocuments,
);

router.post(
  "/:id/documents",
  requirePermission(PERMISSIONS_V2.HR_EMPLOYEES_DOCUMENTS_UPLOAD),
  validate(idParamSchema, "params"),
  validate(uploadDocumentSchema),
  controller.uploadDocument,
);

router.delete(
  "/:id/documents/:docId",
  requirePermission(PERMISSIONS_V2.HR_EMPLOYEES_DOCUMENTS_DELETE),
  validate(docIdParamSchema, "params"),
  controller.deleteDocument,
);

export default router;
