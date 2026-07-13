import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveLocalDbKey } from "@/local/key-derivation";
import { openLocalDb, type LocalDatabase } from "@/local/database";
import { initSchema } from "@/local/schema";
import { createLocalStore } from "@/local/local-store";
import type { PaymentRow, SaleItemRow, SaleRow } from "@/local/local-store.types";
import { getPending } from "@/sync/outbox";
import { readEvent } from "@/sync/event-log";

// Spec §6.3: pending sync events must survive an abrupt store-node stop
// (crash / power loss) with <5s recovery. We can't kill -9 the process from
// inside itself, so we simulate the closest in-process equivalent: close the
// native DB handle without any graceful shutdown (no explicit checkpoint, no
// marking anything synced), then reopen a brand-new handle at the same file
// path and prove the pending outbox rows + their encrypted event payloads
// are still there and still decrypt correctly. WAL + committed transactions
// (Task 6/7/10) are what should make this durable.
describe("crash recovery: pending sync events survive an abrupt store-node stop", () => {
  let dir: string;
  let file: string;
  const key = deriveLocalDbKey("m", "d");

  function makeSale(id: string, invoiceNo: string): SaleRow {
    return {
      id,
      tenantId: "t1",
      storeId: "st1",
      invoiceNo,
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
  }

  function makeItem(id: string, saleId: string): SaleItemRow {
    return {
      id,
      saleId,
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
  }

  function makePayment(id: string, saleId: string): PaymentRow {
    return {
      id,
      tenantId: "t1",
      saleId,
      method: "cash",
      amount: "22.0000",
      referenceNo: null,
      status: "completed",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "rxpos-crash-"));
    file = join(dir, "d.db");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("keeps pending outbox events (and their decryptable payloads) readable after closing the handle uncleanly and reopening a fresh one at the same file", () => {
    // --- "before the crash": open, write several sales, note the pending eventIds ---
    const db1 = openLocalDb({ path: file, key });
    initSchema(db1);
    const store1 = createLocalStore(db1, key);

    const sales: SaleRow[] = [
      makeSale("s1", "INV-1"),
      makeSale("s2", "INV-2"),
      makeSale("s3", "INV-3"),
    ];
    for (const sale of sales) {
      store1.recordSale(
        sale,
        [makeItem(`${sale.id}-i1`, sale.id)],
        [makePayment(`${sale.id}-pay1`, sale.id)],
      );
    }

    const pendingBefore = getPending(db1, Date.now(), 100).map((r) => r.eventId);
    expect(pendingBefore).toHaveLength(3);

    // Sanity: while still open, a chosen event decrypts to the expected sale.
    const chosenEventId = pendingBefore[1]!;
    const decodedBefore = readEvent(db1, key, chosenEventId) as {
      data: { sale: SaleRow };
    };
    expect(decodedBefore.data.sale.invoiceNo).toBeDefined();

    // --- abrupt stop: close the handle WITHOUT marking anything synced or ---
    // --- checkpointing/cleaning up. Durability rests on WAL + committed txns. ---
    db1.close();

    // Using the now-closed handle must fail — proves the assertions below
    // exercise a genuinely fresh handle, not a still-open leftover.
    expect(() => getPending(db1, Date.now(), 100)).toThrow();

    // --- "recovery": brand-new handle, same file, same key ---
    const db2 = openLocalDb({ path: file, key });
    initSchema(db2); // idempotent (CREATE TABLE IF NOT EXISTS)

    const pendingAfter = getPending(db2, Date.now(), 100).map((r) => r.eventId);
    expect(new Set(pendingAfter)).toEqual(new Set(pendingBefore));

    const decodedAfter = readEvent(db2, key, chosenEventId) as {
      entity: string;
      entityId: string;
      op: string;
      data: { sale: SaleRow; items: SaleItemRow[]; payments: PaymentRow[] };
    };
    expect(decodedAfter).toEqual(decodedBefore);
    expect(decodedAfter.data.sale.invoiceNo).toBe("INV-2");

    db2.close();
  });
});
