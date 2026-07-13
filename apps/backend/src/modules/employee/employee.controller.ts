import { Request, Response } from "express";

import { asyncHandler, sendCreated, sendSuccess } from "../../shared/utils";
import { resolveUserPermissions, isSuperAdmin } from "../../shared/permissions/resolver";
import { PERMISSIONS_V2 } from "../../shared/permissions/v2-permissions";

import * as service from "./employee.service";

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.list(req.db!, req.query as never);
  return res.json({ success: true, ...result });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  // Sensitive PII reveal is opt-in based on the actor's
  // `hr.employees.read.sensitive` permission. Non-revealing callers
  // still get the `sensitiveSummary` block (presence-only).
  const actor = req.user!;
  const revealSensitive =
    isSuperAdmin(actor) ||
    resolveUserPermissions(actor).has(PERMISSIONS_V2.HR_EMPLOYEES_READ_SENSITIVE);
  const row = await service.getById(req.db!, req.params.id as string, {
    revealSensitive,
    tenantId: actor.tenantId,
  });
  return sendSuccess(res, row);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.create(req.db!, req.user!, req.body);
  return sendCreated(res, row);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.update(req.db!, req.user!, req.params.id as string, req.body);
  return sendSuccess(res, row);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.deactivate(req.db!, req.user!, req.params.id as string);
  return sendSuccess(res, row);
});

export const restore = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.restore(req.db!, req.user!, req.params.id as string);
  return sendSuccess(res, row);
});

// POST /api/v2/hr/employees/:id/link-user
//
// Links an existing user to the employee OR mints a new user + links
// it atomically. See `service.linkUser` for the two modes and the
// authorization rules. Returns the updated employee with `.user`
// (id/email/role) and — when the service generated the password —
// a one-time `temporaryPassword` (plaintext) for the HR operator
// to hand off.
export const linkUser = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.linkUser(req.db!, req.user!, req.params.id as string, req.body);
  return sendSuccess(res, row);
});

// PATCH /api/v2/hr/employees/:id/sensitive
//
// Encrypts and writes the supplied sensitive PII fields. Route-gated
// by `hr.employees.update.sensitive`. Response mirrors getById's
// reveal shape (the actor passed the update gate, so the read gate
// is implicitly satisfied).
export const updateSensitive = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.updateSensitive(req.db!, req.user!, req.params.id as string, req.body);
  return sendSuccess(res, row);
});

// PATCH /api/v2/hr/employees/:id/salary
//
// Thin alias for payroll.assignEmployeeSalary — employee id from
// path. Phase 20b / OI-024. Route-gated by
// `hr.employees.update.salary`.
export const updateSalary = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.updateSalary(req.db!, req.user!, req.params.id as string, req.body);
  return sendSuccess(res, row);
});

// POST /api/v2/hr/employees/:id/terminate
//
// Atomic separation cascade. See
// service.terminate for the steps. Returns the updated Employee
// plus a `cascadeSummary` describing what was touched so the FE
// can render a confirmation banner.
export const terminate = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.terminate(req.db!, req.user!, req.params.id as string, req.body);
  return sendSuccess(res, row);
});

// ── contracts + documents ─────────────────────────

import * as contractsService from "./contracts.service";
import * as documentsService from "./documents.service";

export const listContracts = asyncHandler(async (req: Request, res: Response) => {
  const result = await contractsService.list(req.db!, req.params.id as string, req.query as never);
  return res.json({ success: true, ...result });
});

export const createContract = asyncHandler(async (req: Request, res: Response) => {
  const row = await contractsService.create(req.db!, req.user!, req.params.id as string, req.body);
  return sendCreated(res, row);
});

export const listDocuments = asyncHandler(async (req: Request, res: Response) => {
  const result = await documentsService.list(req.db!, req.params.id as string, req.query as never);
  return res.json({ success: true, ...result });
});

export const uploadDocument = asyncHandler(async (req: Request, res: Response) => {
  const row = await documentsService.upload(req.db!, req.user!, req.params.id as string, req.body);
  return sendCreated(res, row);
});

export const deleteDocument = asyncHandler(async (req: Request, res: Response) => {
  const row = await documentsService.remove(
    req.db!,
    req.user!,
    req.params.id as string,
    req.params.docId as string,
  );
  return sendSuccess(res, row);
});
