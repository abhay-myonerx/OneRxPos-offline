// Parked-sale (suspend/resume) data access — Phase 1.3b.
//
// A parked sale is a best-effort BACKEND MIRROR of an IndexedDB-authoritative
// hold. All access goes through the request-scoped `TenantPrismaClient` (built
// by `tenantContext` from the caller's JWT tenant), which auto-injects
// `tenantId` into every WHERE clause and create payload — so cross-tenant rows
// can never be read, mirrored, claimed, or discarded here. Mirrors the
// data-access + `{ success, data }` style of `sale.service.ts`.

import type { TenantPrismaClient } from "../../config/database";
import type { CreateParkedSaleInput } from "./parked-sale.validation";

// The store-scoped recall DTO (matches the frontend contract exactly).
export interface ParkedSaleDto {
  id: string;
  storeId: string;
  customerId: string | null;
  label: string | null;
  parkedByName: string | null;
  snapshot: unknown;
  itemCount: number;
  total: number;
  cashierId: string;
  status: string;
  createdAt: Date;
}

// ── Create / mirror (idempotent by client-supplied id) ────────────────────────
//
// Idempotent upsert on `{ id }`: on conflict, only a still-`PARKED` row is
// updated (snapshot/label/customerId/itemCount/total) — a CLAIMED or DISCARDED
// row is never resurrected by a late/duplicate mirror write.
export async function mirrorParkedSale(
  db: TenantPrismaClient,
  tenantId: string,
  cashierId: string,
  input: CreateParkedSaleInput,
): Promise<{ id: string }> {
  const payload = {
    snapshot: input.snapshot as object,
    label: input.label ?? null,
    customerId: input.customerId ?? null,
    itemCount: input.itemCount,
    total: input.total,
  };

  const existing = await db.parkedSale.findUnique({
    where: { id: input.id },
    select: { status: true },
  });

  if (!existing) {
    await db.parkedSale.create({
      // `tenantId` is passed explicitly to satisfy the compile-time create
      // type (the required `tenant` relation); the tenant-scope extension
      // re-injects the SAME tenantId at runtime, so this is redundant-safe —
      // mirrors `levy.service.ts` / `store.service.ts`.
      data: {
        id: input.id,
        tenantId,
        storeId: input.storeId,
        cashierId,
        parkedByName: input.parkedByName ?? null,
        status: "PARKED",
        ...payload,
      },
    });
  } else if (existing.status === "PARKED") {
    await db.parkedSale.update({ where: { id: input.id }, data: payload });
  }
  // else CLAIMED/DISCARDED → no-op (never resurrect)

  return { id: input.id };
}

// ── List PARKED holds for a store (tenant-scoped, newest first) ───────────────
export async function listParkedSales(
  db: TenantPrismaClient,
  storeId: string,
): Promise<ParkedSaleDto[]> {
  const rows = await db.parkedSale.findMany({
    where: { storeId, status: "PARKED" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      storeId: true,
      customerId: true,
      label: true,
      parkedByName: true,
      snapshot: true,
      itemCount: true,
      total: true,
      cashierId: true,
      status: true,
      createdAt: true,
    },
  });

  return rows.map((r) => ({
    id: r.id,
    storeId: r.storeId,
    customerId: r.customerId,
    label: r.label,
    parkedByName: r.parkedByName,
    snapshot: r.snapshot,
    itemCount: r.itemCount,
    total: Number(r.total),
    cashierId: r.cashierId,
    status: r.status,
    createdAt: r.createdAt,
  }));
}

// ── Atomic claim (PARKED → CLAIMED) ───────────────────────────────────────────
//
// Conditional `updateMany` on `{ id, status: "PARKED" }` is the single-claim
// guard: the winner flips the row and gets the snapshot; a second claim (row
// already CLAIMED/DISCARDED, or not found) matches nothing → `null` → 409.
export async function claimParkedSale(
  db: TenantPrismaClient,
  id: string,
  userId: string,
): Promise<{ snapshot: unknown } | null> {
  const result = await db.parkedSale.updateMany({
    where: { id, status: "PARKED" },
    data: { status: "CLAIMED", claimedByUserId: userId, claimedAt: new Date() },
  });

  if (result.count === 0) return null;

  const row = await db.parkedSale.findUnique({
    where: { id },
    select: { snapshot: true },
  });

  return { snapshot: row?.snapshot ?? null };
}

// ── Discard (idempotent) ──────────────────────────────────────────────────────
export async function discardParkedSale(db: TenantPrismaClient, id: string): Promise<void> {
  await db.parkedSale.updateMany({ where: { id }, data: { status: "DISCARDED" } });
}
