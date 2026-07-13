// BarcodeTemplate (learned label templates) data access — Phase 1.3c.
//
// A barcode template declares WHEN it applies (matchType/matchValue) and HOW to
// carve fields (strategy + opaque `config`) so the decode pipeline can read any
// vendor/Rx label without a code change. All access goes through the
// request-scoped `TenantPrismaClient` (built by `tenantContext` from the
// caller's JWT tenant), which auto-injects `tenantId` into every WHERE clause
// and create payload — so cross-tenant templates can never be read, updated, or
// deleted here. Mirrors the data-access + `{ success, data }` style of
// `parked-sale.service.ts`.

import type { TenantPrismaClient } from "../../config/database";
import type {
  CreateBarcodeTemplateInput,
  UpdateBarcodeTemplateInput,
} from "./barcode-template.validation";

// The tenant-scoped template DTO (matches the frontend contract exactly).
export interface BarcodeTemplateDto {
  id: string;
  name: string;
  matchType: string;
  matchValue: string;
  strategy: string;
  config: unknown;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SELECT = {
  id: true,
  name: true,
  matchType: true,
  matchValue: true,
  strategy: true,
  config: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

function toDto(r: {
  id: string;
  name: string;
  matchType: string;
  matchValue: string;
  strategy: string;
  config: unknown;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): BarcodeTemplateDto {
  return {
    id: r.id,
    name: r.name,
    matchType: r.matchType,
    matchValue: r.matchValue,
    strategy: r.strategy,
    config: r.config,
    isActive: r.isActive,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

// ── List this tenant's templates (newest first) ───────────────────────────────
export async function listBarcodeTemplates(
  db: TenantPrismaClient,
): Promise<BarcodeTemplateDto[]> {
  const rows = await db.barcodeTemplate.findMany({
    orderBy: { createdAt: "desc" },
    select: SELECT,
  });
  return rows.map(toDto);
}

// ── Create ────────────────────────────────────────────────────────────────────
export async function createBarcodeTemplate(
  db: TenantPrismaClient,
  tenantId: string,
  input: CreateBarcodeTemplateInput,
): Promise<BarcodeTemplateDto> {
  const row = await db.barcodeTemplate.create({
    // `tenantId` is passed explicitly to satisfy the compile-time create type
    // (the required `tenant` relation); the tenant-scope extension re-injects
    // the SAME tenantId at runtime, so this is redundant-safe — mirrors
    // `parked-sale.service.ts`.
    data: {
      tenantId,
      name: input.name,
      matchType: input.matchType,
      matchValue: input.matchValue,
      strategy: input.strategy,
      config: input.config as object,
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    select: SELECT,
  });
  return toDto(row);
}

// ── Update (tenant-scoped; 404 when not found for this tenant) ────────────────
export async function updateBarcodeTemplate(
  db: TenantPrismaClient,
  id: string,
  input: UpdateBarcodeTemplateInput,
): Promise<BarcodeTemplateDto | null> {
  // Tenant-scoped existence check first — the extension filters by tenantId, so
  // a template belonging to another tenant reads as "not found".
  const existing = await db.barcodeTemplate.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) return null;

  const row = await db.barcodeTemplate.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.matchType !== undefined ? { matchType: input.matchType } : {}),
      ...(input.matchValue !== undefined ? { matchValue: input.matchValue } : {}),
      ...(input.strategy !== undefined ? { strategy: input.strategy } : {}),
      ...(input.config !== undefined ? { config: input.config as object } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    select: SELECT,
  });
  return toDto(row);
}

// ── Delete (hard delete, tenant-scoped) ───────────────────────────────────────
export async function deleteBarcodeTemplate(
  db: TenantPrismaClient,
  id: string,
): Promise<void> {
  await db.barcodeTemplate.deleteMany({ where: { id } });
}
