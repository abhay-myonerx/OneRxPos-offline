// Race-safe stock writes backed by the (store_id, product_id, variant_id)
// unique constraint with NULLS NOT DISTINCT (added in the manual migration).
//
// Why raw SQL?
//   Prisma's generated `upsert()` and `where: { compound_unique: {...} }`
//   inputs historically exclude composite unique keys that contain nullable
//   columns. Our uniqueness key has variantId (String?), so depending on the
//   Prisma version the typed upsert may or may not be usable.
//
//   Raw `INSERT ... ON CONFLICT` sidesteps the type-level quirk entirely,
//   executes in a single atomic statement, and benefits from the same
//   unique-with-NULLS-NOT-DISTINCT index. No findFirst -> update/create race.
//
// Both helpers return the new quantity value so callers can write a
// StockMovement row with the correct quantityAfter.

import { randomUUID } from "node:crypto";
import type { TenantPrismaClient } from "../../config/database";
import { config } from "../../config";

// The store-node SQLite backend has no `gen_random_uuid()` / `NOW()` and its
// UNIQUE index treats NULLs as DISTINCT (unlike the Postgres migration's
// `NULLS NOT DISTINCT`), so `ON CONFLICT` never fires for a null variant_id.
// When DATA_BACKEND=sqlite we therefore take a portable path: generate the id
// in JS, bind an ISO-8601 timestamp (Prisma's sqlite DateTime storage format),
// and do an explicit null-safe UPDATE-else-INSERT (correct for null variants;
// race-safe under the store-node single-writer model). The Postgres path is
// left byte-for-byte unchanged.
const IS_SQLITE = config.DATA_BACKEND === "sqlite";

// IMPORTANT: TenantPrismaClient is a `$extends`'d client, so its transaction
// callback receives a *different* type than the base `Prisma.TransactionClient`.
// We can't derive the callback parameter via `Parameters<...$transaction>` —
// `$transaction` is overloaded and TypeScript only sees the last overload
// (the array form), not the callback form.
//
// Instead we mirror Prisma's own TransactionClient definition: the extended
// client minus the methods that can't be called inside a transaction. This
// matches the exact `Omit<..., "$extends" | "$disconnect" | "$connect" |
// "$on" | "$use">` shape Prisma uses internally.
export type Tx = Omit<
  TenantPrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/**
 * Atomically adds `delta` (positive or negative) to the stock row for
 * (storeId, productId, variantId). Creates the row if it doesn't exist.
 * Returns the row's quantity AFTER the change.
 */
export async function applyStockDelta(
  tx: Tx,
  storeId: string,
  productId: string,
  variantId: string | null,
  delta: number,
  defaultThreshold = 10,
): Promise<number> {
  if (IS_SQLITE) {
    const now = new Date().toISOString();
    const updated = await tx.$queryRaw<Array<{ quantity: number }>>`
      UPDATE store_stock
         SET quantity   = quantity + ${delta},
             updated_at = ${now}
       WHERE store_id   = ${storeId}
         AND product_id = ${productId}
         AND variant_id IS ${variantId}
      RETURNING quantity;
    `;
    if (updated[0]) return updated[0].quantity;

    const inserted = await tx.$queryRaw<Array<{ quantity: number }>>`
      INSERT INTO store_stock
        (id, store_id, product_id, variant_id, quantity, low_stock_threshold, updated_at)
      VALUES
        (${randomUUID()}, ${storeId}, ${productId}, ${variantId}, ${delta}, ${defaultThreshold}, ${now})
      RETURNING quantity;
    `;
    if (!inserted[0]) throw new Error("applyStockDelta: insert returned no row");
    return inserted[0].quantity;
  }

  const rows = await tx.$queryRaw<Array<{ quantity: number }>>`
    INSERT INTO store_stock
      (id, store_id, product_id, variant_id, quantity, low_stock_threshold, updated_at)
    VALUES
      (gen_random_uuid(), ${storeId}, ${productId}, ${variantId}, ${delta}, ${defaultThreshold}, NOW())
    ON CONFLICT (store_id, product_id, variant_id)
    DO UPDATE SET
      quantity   = store_stock.quantity + EXCLUDED.quantity,
      updated_at = NOW()
    RETURNING quantity;
  `;

  if (!rows[0]) {
    throw new Error("applyStockDelta: upsert returned no row");
  }
  return rows[0].quantity;
}

/**
 * Atomically sets the absolute quantity for (storeId, productId, variantId).
 * Creates the row if it doesn't exist. Returns the new quantity (always
 * equal to the input `quantity`, returned for symmetry with applyStockDelta).
 */
export async function setStockAbsolute(
  tx: Tx,
  storeId: string,
  productId: string,
  variantId: string | null,
  quantity: number,
  defaultThreshold = 10,
): Promise<number> {
  if (IS_SQLITE) {
    const now = new Date().toISOString();
    const updated = await tx.$queryRaw<Array<{ quantity: number }>>`
      UPDATE store_stock
         SET quantity   = ${quantity},
             updated_at = ${now}
       WHERE store_id   = ${storeId}
         AND product_id = ${productId}
         AND variant_id IS ${variantId}
      RETURNING quantity;
    `;
    if (updated[0]) return updated[0].quantity;

    const inserted = await tx.$queryRaw<Array<{ quantity: number }>>`
      INSERT INTO store_stock
        (id, store_id, product_id, variant_id, quantity, low_stock_threshold, updated_at)
      VALUES
        (${randomUUID()}, ${storeId}, ${productId}, ${variantId}, ${quantity}, ${defaultThreshold}, ${now})
      RETURNING quantity;
    `;
    if (!inserted[0]) throw new Error("setStockAbsolute: insert returned no row");
    return inserted[0].quantity;
  }

  const rows = await tx.$queryRaw<Array<{ quantity: number }>>`
    INSERT INTO store_stock
      (id, store_id, product_id, variant_id, quantity, low_stock_threshold, updated_at)
    VALUES
      (gen_random_uuid(), ${storeId}, ${productId}, ${variantId}, ${quantity}, ${defaultThreshold}, NOW())
    ON CONFLICT (store_id, product_id, variant_id)
    DO UPDATE SET
      quantity   = EXCLUDED.quantity,
      updated_at = NOW()
    RETURNING quantity;
  `;

  if (!rows[0]) {
    throw new Error("setStockAbsolute: upsert returned no row");
  }
  return rows[0].quantity;
}

/**
 * Reads current quantity for a (store, product, variant). Returns 0 if no row.
 * Use inside a transaction when you need a consistent read before computing
 * a clamped or conditional new value.
 */
export async function readStockQuantity(
  tx: Tx,
  storeId: string,
  productId: string,
  variantId: string | null,
): Promise<number> {
  // `IS NOT DISTINCT FROM` is Postgres-only; SQLite's `IS` is the equivalent
  // null-safe comparison operator.
  const rows = IS_SQLITE
    ? await tx.$queryRaw<Array<{ quantity: number }>>`
        SELECT quantity
          FROM store_stock
         WHERE store_id   = ${storeId}
           AND product_id = ${productId}
           AND variant_id IS ${variantId}
         LIMIT 1;
      `
    : await tx.$queryRaw<Array<{ quantity: number }>>`
        SELECT quantity
          FROM store_stock
         WHERE store_id   = ${storeId}
           AND product_id = ${productId}
           AND variant_id IS NOT DISTINCT FROM ${variantId}
         LIMIT 1;
      `;
  return rows[0]?.quantity ?? 0;
}
