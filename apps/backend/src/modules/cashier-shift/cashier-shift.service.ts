// CashierShift till-session lifecycle + CashMovement data access — Phase 1.4.
//
// A till session (`CashierShift`) opens with a counted float, every checkout
// attaches to it via `shiftId` (checkout.service already stamps this), paid-in /
// paid-out cash movements adjust the drawer, and closing counts the drawer and
// reconciles over/short against an authoritative expected-cash computation.
//
// All access goes through the request-scoped `TenantPrismaClient` (built by
// `tenantContext` from the caller's JWT tenant), which auto-injects `tenantId`
// into every WHERE clause and create payload — so a shift, movement, or sale
// belonging to another tenant can never be read, closed, or tallied here.
// Mirrors the data-access + `{ success, data }` style of `barcode-template`.

import type { TenantPrismaClient } from "../../config/database";
import { m } from "../../shared/utils/money";
import { ConflictError } from "../../shared/errors/ConflictError";
import { NotFoundError } from "../../shared/errors/NotFoundError";
import { countTotal, type DenominationCounts } from "./cash-math";
import type { CashMovementInput, CloseShiftInput, OpenShiftInput } from "./cashier-shift.validation";

// ── DTOs (frontend contract — Decimals rendered as Number so JSON is numeric) ──

export interface ShiftDto {
  id: string;
  storeId: string;
  userId: string;
  openedAt: Date;
  closedAt: Date | null;
  openingCash: number;
  closingCash: number | null;
  expectedCash: number | null;
  difference: number | null;
  openingCounts: unknown;
  closingCounts: unknown;
  notes: string | null;
}

export interface CashMovementDto {
  id: string;
  shiftId: string;
  type: string;
  amount: number;
  reason: string | null;
  userId: string;
  createdAt: Date;
}

export interface SummaryDto {
  salesCount: number;
  tenderBreakdown: Record<string, number>;
  changeTotal: number;
  paidIn: number;
  paidOut: number;
  netCashFromSales: number;
  expectedCash: number;
}

// ── Coercion helpers ──────────────────────────────────────────────────────────
// Prisma returns Decimals for money columns (JS numbers in the in-memory test
// fake). `String(x)` normalises both into a decimal.js input losslessly.
function dec(x: unknown) {
  return m(String(x ?? 0));
}

function round2(d: ReturnType<typeof m>): number {
  return Number(d.toDecimalPlaces(2).toFixed(2));
}

// Decimal | number | null → number | null (2dp).
function toNum(x: unknown): number | null {
  if (x === null || x === undefined) return null;
  return round2(dec(x));
}

interface ShiftRow {
  id: string;
  storeId: string;
  userId: string;
  openedAt: Date;
  closedAt: Date | null;
  openingCash: unknown;
  closingCash: unknown;
  expectedCash: unknown;
  difference: unknown;
  openingCounts: unknown;
  closingCounts: unknown;
  notes: string | null;
}

function toShiftDto(r: ShiftRow): ShiftDto {
  return {
    id: r.id,
    storeId: r.storeId,
    userId: r.userId,
    openedAt: r.openedAt,
    closedAt: r.closedAt,
    openingCash: round2(dec(r.openingCash)),
    closingCash: toNum(r.closingCash),
    expectedCash: toNum(r.expectedCash),
    difference: toNum(r.difference),
    openingCounts: r.openingCounts ?? null,
    closingCounts: r.closingCounts ?? null,
    notes: r.notes ?? null,
  };
}

const SHIFT_SELECT = {
  id: true,
  storeId: true,
  userId: true,
  openedAt: true,
  closedAt: true,
  openingCash: true,
  closingCash: true,
  expectedCash: true,
  difference: true,
  openingCounts: true,
  closingCounts: true,
  notes: true,
} as const;

// ── Open a till ───────────────────────────────────────────────────────────────
// One open shift per (user, store): reject 409 if the caller already has one.
export async function openShift(
  db: TenantPrismaClient,
  tenantId: string,
  userId: string,
  input: OpenShiftInput,
): Promise<ShiftDto> {
  const existing = await db.cashierShift.findFirst({
    where: { userId, storeId: input.storeId, closedAt: null },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError("You already have an open till session at this store");
  }

  const openingCash = countTotal(input.openingCounts as DenominationCounts);

  const row = await db.cashierShift.create({
    // `tenantId` passed explicitly to satisfy the compile-time create type; the
    // tenant-scope extension re-injects the same tenantId at runtime.
    data: {
      tenantId,
      storeId: input.storeId,
      userId,
      openingCash,
      openingCounts: input.openingCounts as object,
    },
    select: SHIFT_SELECT,
  });
  return toShiftDto(row as ShiftRow);
}

// ── Current open shift for the caller at a store (or null) ────────────────────
export async function getCurrentShift(
  db: TenantPrismaClient,
  userId: string,
  storeId: string,
): Promise<ShiftDto | null> {
  const row = await db.cashierShift.findFirst({
    where: { userId, storeId, closedAt: null },
    select: SHIFT_SELECT,
  });
  return row ? toShiftDto(row as ShiftRow) : null;
}

// ── Record a paid-in / paid-out cash movement ─────────────────────────────────
export async function recordCashMovement(
  db: TenantPrismaClient,
  tenantId: string,
  userId: string,
  shiftId: string,
  input: CashMovementInput,
): Promise<CashMovementDto> {
  const shift = await db.cashierShift.findUnique({
    where: { id: shiftId },
    select: { id: true, closedAt: true },
  });
  if (!shift) throw new NotFoundError("Cashier shift", shiftId);
  if (shift.closedAt) {
    throw new ConflictError("Cashier shift is already closed");
  }

  const row = await db.cashMovement.create({
    data: {
      tenantId,
      shiftId,
      userId,
      type: input.type,
      amount: input.amount,
      reason: input.reason ?? null,
    },
    select: {
      id: true,
      shiftId: true,
      type: true,
      amount: true,
      reason: true,
      userId: true,
      createdAt: true,
    },
  });

  return {
    id: row.id,
    shiftId: row.shiftId,
    type: row.type,
    amount: round2(dec(row.amount)),
    reason: row.reason ?? null,
    userId: row.userId,
    createdAt: row.createdAt,
  };
}

// ── Live tally (X-report / used by close) ─────────────────────────────────────
//
// Authoritative expected-cash (§5):
//   expectedCash = openingCash + netCashFromSales − paidOut + paidIn
//   netCashFromSales = Σ over the shift's sales of
//                        ( Σ payments where method="CASH" .amount ) − changeAmount
//                      (net cash the drawer actually received = tendered − change).
//
// Refunds/returns: this codebase's return path (sale.service.returnSale) restores
// stock + reverses loyalty but writes NO negative cash / drawer reversal, so there
// is no cash-refund figure to subtract — refunds are intentionally omitted here.
async function computeTally(db: TenantPrismaClient, shift: ShiftRow) {
  const sales = await db.sale.findMany({
    where: { shiftId: shift.id },
    select: { changeAmount: true, payments: { select: { method: true, amount: true } } },
  });

  const movements = await db.cashMovement.findMany({
    where: { shiftId: shift.id },
    select: { type: true, amount: true },
  });

  const tenderBreakdown: Record<string, number> = {};
  const tenderTotals: Record<string, ReturnType<typeof m>> = {};
  let cashTendered = m(0);
  let changeTotal = m(0);

  for (const sale of sales) {
    changeTotal = changeTotal.plus(dec(sale.changeAmount));
    for (const p of sale.payments) {
      const method = String(p.method);
      tenderTotals[method] = (tenderTotals[method] ?? m(0)).plus(dec(p.amount));
      if (method === "CASH") cashTendered = cashTendered.plus(dec(p.amount));
    }
  }

  for (const [method, total] of Object.entries(tenderTotals)) {
    tenderBreakdown[method] = round2(total);
  }

  let paidIn = m(0);
  let paidOut = m(0);
  for (const mv of movements) {
    if (mv.type === "PAID_IN") paidIn = paidIn.plus(dec(mv.amount));
    else if (mv.type === "PAID_OUT") paidOut = paidOut.plus(dec(mv.amount));
  }

  const netCashFromSales = cashTendered.minus(changeTotal);
  const openingCash = dec(shift.openingCash);
  const expectedCash = openingCash.plus(netCashFromSales).minus(paidOut).plus(paidIn);

  return {
    salesCount: sales.length,
    tenderBreakdown,
    changeTotal: round2(changeTotal),
    paidIn: round2(paidIn),
    paidOut: round2(paidOut),
    netCashFromSales: round2(netCashFromSales),
    expectedCash: round2(expectedCash),
    _expectedCashDecimal: expectedCash,
  };
}

export async function getSummary(
  db: TenantPrismaClient,
  shiftId: string,
): Promise<SummaryDto> {
  const shift = await db.cashierShift.findUnique({
    where: { id: shiftId },
    select: SHIFT_SELECT,
  });
  if (!shift) throw new NotFoundError("Cashier shift", shiftId);

  const tally = await computeTally(db, shift as ShiftRow);
  return {
    salesCount: tally.salesCount,
    tenderBreakdown: tally.tenderBreakdown,
    changeTotal: tally.changeTotal,
    paidIn: tally.paidIn,
    paidOut: tally.paidOut,
    netCashFromSales: tally.netCashFromSales,
    expectedCash: tally.expectedCash,
  };
}

// ── Close a till ──────────────────────────────────────────────────────────────
export async function closeShift(
  db: TenantPrismaClient,
  shiftId: string,
  input: CloseShiftInput,
): Promise<ShiftDto> {
  const shift = await db.cashierShift.findUnique({
    where: { id: shiftId },
    select: SHIFT_SELECT,
  });
  if (!shift) throw new NotFoundError("Cashier shift", shiftId);
  if ((shift as ShiftRow).closedAt) {
    throw new ConflictError("Cashier shift is already closed");
  }

  const tally = await computeTally(db, shift as ShiftRow);
  const countedCash = countTotal(input.closingCounts as DenominationCounts);
  const difference = round2(m(countedCash).minus(tally._expectedCashDecimal));

  const row = await db.cashierShift.update({
    where: { id: shiftId },
    data: {
      closedAt: new Date(),
      closingCash: countedCash,
      expectedCash: tally.expectedCash,
      difference,
      closingCounts: input.closingCounts as object,
    },
    select: SHIFT_SELECT,
  });
  return toShiftDto(row as ShiftRow);
}
