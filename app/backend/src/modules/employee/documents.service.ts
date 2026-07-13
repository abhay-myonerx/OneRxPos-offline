// EmployeeDocument CRUD (metadata only — the
// FE uploads the actual file via Cloudinary, we store the URL).

import type { TenantPrismaClient } from "../../config/database";
import { NotFoundError } from "../../shared/errors";
import { buildPrismaListQuery, formatListResponse } from "../../shared/utils/listQuery";
import { recordAudit } from "../../shared/utils/auditLog";
import type { AuthUserLike } from "../../shared/permissions/resolver";

import type { UploadDocumentInput } from "./documents.validation";

const documentSelect = {
  id: true,
  employeeId: true,
  documentType: true,
  fileName: true,
  fileUrl: true,
  mimeType: true,
  sizeBytes: true,
  expiresAt: true,
  isConfidential: true,
  uploadedBy: true,
  notes: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

interface ListOptions {
  // ESS callers pass `excludeConfidential: true` to enforce the
  // documented "ESS hides confidential" rule (deep-dive §11).
  excludeConfidential?: boolean;
}

export async function list(
  db: TenantPrismaClient,
  employeeId: string,
  params: Record<string, unknown>,
  options: ListOptions = {},
) {
  const emp = await db.employee.findUnique({
    where: { id: employeeId },
    select: { id: true },
  });
  if (!emp) throw new NotFoundError("Employee", employeeId);

  const baseWhere: Record<string, unknown> = {
    employeeId,
    isActive: true,
  };
  if (options.excludeConfidential) {
    baseWhere.isConfidential = false;
  }

  const { where, orderBy, skip, take, meta } = buildPrismaListQuery(params as never, {
    extraWhere: baseWhere,
    searchableFields: ["fileName", "documentType"],
  });

  const [data, total] = await Promise.all([
    db.employeeDocument.findMany({
      where,
      orderBy,
      skip,
      take,
      select: documentSelect,
    }),
    db.employeeDocument.count({ where }),
  ]);
  return formatListResponse(data, total, meta);
}

export async function upload(
  db: TenantPrismaClient,
  actor: AuthUserLike,
  employeeId: string,
  input: UploadDocumentInput,
) {
  const emp = await db.employee.findUnique({
    where: { id: employeeId },
    select: { id: true },
  });
  if (!emp) throw new NotFoundError("Employee", employeeId);

  const row = await db.employeeDocument.create({
    data: {
      tenantId: actor.tenantId,
      employeeId,
      documentType: input.documentType,
      fileName: input.fileName,
      fileUrl: input.fileUrl,
      mimeType: input.mimeType ?? null,
      sizeBytes: input.sizeBytes ?? null,
      expiresAt: input.expiresAt ?? null,
      isConfidential: input.isConfidential,
      uploadedBy: actor.id,
      notes: input.notes ?? null,
      isActive: true,
    },
    select: documentSelect,
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "EMPLOYEE_DOCUMENT_UPLOADED",
    entityType: "EmployeeDocument",
    entityId: row.id,
    // The URL is potentially signed/scoped — redact from audit
    // to avoid leaking access tokens into the audit log.
    newData: {
      ...row,
      fileUrl: "[REDACTED]",
      fieldsRedacted: ["fileUrl", "notes"],
    },
  });

  return row;
}

export async function remove(
  db: TenantPrismaClient,
  actor: AuthUserLike,
  employeeId: string,
  docId: string,
) {
  const existing = await db.employeeDocument.findUnique({
    where: { id: docId },
    select: documentSelect,
  });
  if (!existing || existing.employeeId !== employeeId) {
    throw new NotFoundError("EmployeeDocument", docId);
  }

  // Soft-delete — `isActive: false`. We never delete from the
  // table so the audit trail stays intact. The FE list endpoint
  // already filters by `isActive: true`.
  const row = await db.employeeDocument.update({
    where: { id: docId },
    data: { isActive: false },
    select: documentSelect,
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "EMPLOYEE_DOCUMENT_DELETED",
    entityType: "EmployeeDocument",
    entityId: docId,
    oldData: { ...existing, fileUrl: "[REDACTED]" },
  });

  return row;
}
