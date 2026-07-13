import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveLocalDbKey } from "@/local/key-derivation";
import { openLocalDb, type LocalDatabase } from "@/local/database";
import { initSchema } from "@/local/schema";
import { createLocalStore } from "@/local/local-store";
import type { LocalStore, PaymentRow, SaleItemRow, SaleRow } from "@/local/local-store.types";
import { backoffMs, getPending } from "../outbox";
import { createSyncClient } from "../sync-client";

function makeSale(id: string): { sale: SaleRow; items: SaleItemRow[]; payments: PaymentRow[] } {
  const sale: SaleRow = {
    id,
    tenantId: "t1",
    storeId: "st1",
    invoiceNo: `INV-${id}`,
    subtotal: "20.0000",
    taxTotal: "2.0000",
    grandTotal: "22.0000",
    paidAmount: "22.0000",
    dueAmount: "0.0000",
    changeAmount: "0.0000",
    status: "completed",
    cashierId: "u1",
    shiftId: "sh1",
    customerId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const item: SaleItemRow = {
    id: `si-${id}`,
    saleId: id,
    productId: "p1",
    variantId: null,
    quantity: "2",
    unitPrice: "10.0000",
    costPrice: "8.0000",
    discount: "0.0000",
    taxRate: "10.0000",
    taxAmount: "2.0000",
    lineTotal: "22.0000",
  };
  const payment: PaymentRow = {
    id: `pay-${id}`,
    tenantId: "t1",
    saleId: id,
    method: "cash",
    amount: "22.0000",
    referenceNo: null,
    status: "completed",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  return { sale, items: [item], payments: [payment] };
}

describe("createSyncClient.drain", () => {
  let dir: string;
  let db: LocalDatabase;
  const key = deriveLocalDbKey("m", "d");
  let store: LocalStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "rxpos-sync-client-"));
    db = openLocalDb({ path: join(dir, "d.db"), key });
    initSchema(db);
    store = createLocalStore(db, key);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("pushes all pending outbox events and marks them synced when the server accepts them", async () => {
    const s1 = makeSale("s1");
    const s2 = makeSale("s2");
    store.recordSale(s1.sale, s1.items, s1.payments);
    store.recordSale(s2.sale, s2.items, s2.payments);

    const client = createSyncClient({
      db,
      key,
      http: async (_url, body) => ({
        status: 200,
        body: { accepted: body.events.map((e) => e.id), configDeltas: [] },
      }),
      cloudUrl: "http://cloud.test/api/v2/sync",
      token: "test-token",
    });

    const result = await client.drain();

    expect(result).toEqual({ pushed: 2, failed: 0 });
    expect(getPending(db, Date.now(), 100)).toEqual([]);
  });

  it("marks pending events failed with backoff when the server responds with a non-2xx status", async () => {
    const s1 = makeSale("s3");
    const s2 = makeSale("s4");
    store.recordSale(s1.sale, s1.items, s1.payments);
    store.recordSale(s2.sale, s2.items, s2.payments);

    const now = Date.now();
    const client = createSyncClient({
      db,
      key,
      http: async () => ({ status: 503, body: {} }),
      cloudUrl: "http://cloud.test/api/v2/sync",
      token: "test-token",
    });

    const result = await client.drain(now);

    expect(result).toEqual({ pushed: 0, failed: 2 });

    expect(getPending(db, now, 100)).toEqual([]);
    expect(getPending(db, now + backoffMs(1), 100)).toHaveLength(2);

    const rows = db
      .prepare("SELECT attempts, nextAttemptAt FROM sync_outbox ORDER BY rowid ASC")
      .all() as { attempts: number; nextAttemptAt: number | string }[];
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.attempts).toBe(1);
      expect(Number(row.nextAttemptAt)).toBeGreaterThan(now);
    }
  });
});
