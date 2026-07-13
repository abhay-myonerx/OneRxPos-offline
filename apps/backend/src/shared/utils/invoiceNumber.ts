import { PrismaClient } from "../../generated/prisma/client";

export type SequenceType = "sale" | "purchase" | "quotation" | "transfer";

/**
 * Generates the next sequential number for a tenant + document type.
 *
 * Uses Prisma ORM upsert for a fully atomic increment with no raw SQL —
 * avoids all PostgreSQL type-casting issues (text vs uuid).
 * Must be called INSIDE a Prisma transaction — pass the `tx` client.
 *
 * @example
 *   const no = await getNextNumber(tx, tenantId, "sale", "INV-");
 *   // → "INV-1001"
 */
export async function getNextNumber(
  tx: PrismaClient,
  tenantId: string,
  type: SequenceType,
  prefix: string,
): Promise<string> {
  // Atomic upsert:
  //   - If the row exists  → increment lastNumber and return it
  //   - If it doesn't yet  → create it with lastNumber = 1 and return 1
  // Prisma compiles this to a single INSERT … ON CONFLICT DO UPDATE
  // which is safe under concurrent transactions.
  const seq = await tx.invoiceSequence.upsert({
    where: {
      tenantId_type: { tenantId, type },
    },
    create: {
      tenantId,
      type,
      prefix,
      lastNumber: 1,
    },
    update: {
      lastNumber: { increment: 1 },
    },
    select: { lastNumber: true },
  });

  return `${prefix}${seq.lastNumber}`;
}

/**
 * Atomic per-store, per-day sale counter (resets to 1 each day, per store).
 * Reuses the InvoiceSequence table with a scoped `type` key so it stays a
 * single atomic upsert (safe under concurrent checkouts) with no extra table.
 * Returns the raw number (1, 2, 3, … for that store on that day).
 */
export async function getNextDailySaleNumber(
  tx: PrismaClient,
  tenantId: string,
  storeId: string,
  dateKey: string, // "YYYYMMDD" in the store's timezone
): Promise<number> {
  const type = `d:${storeId}:${dateKey}`;
  const seq = await tx.invoiceSequence.upsert({
    where: { tenantId_type: { tenantId, type } },
    create: { tenantId, type, prefix: "", lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
    select: { lastNumber: true },
  });
  return seq.lastNumber;
}

/**
 * Compose the customer-facing invoice number:
 *   RXPOS-<storeCode>-<dailyNumber(4-padded)>-<YYYYMMDD>
 * e.g. RXPOS-PH001-0001-20260709
 */
export function composeSaleInvoiceNo(
  storeCode: string,
  dailyNumber: number,
  dateKey: string,
): string {
  const code = (storeCode || "NA").trim().toUpperCase();
  const seq = String(dailyNumber).padStart(4, "0");
  return `RXPOS-${code}-${seq}-${dateKey}`;
}
