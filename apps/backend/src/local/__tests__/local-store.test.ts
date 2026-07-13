import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveLocalDbKey } from "@/local/key-derivation";
import { openLocalDb, type LocalDatabase } from "@/local/database";
import { initSchema } from "@/local/schema";
import { createLocalStore } from "../local-store";
import type {
  CustomerRow,
  LocalStore,
  PaymentRow,
  ProductRow,
  SaleItemRow,
  SaleRow,
} from "../local-store.types";

describe("createLocalStore", () => {
  let dir: string;
  let db: LocalDatabase;
  const key = deriveLocalDbKey("m", "d");
  let store: LocalStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "rxpos-local-store-"));
    db = openLocalDb({ path: join(dir, "d.db"), key });
    initSchema(db);
    store = createLocalStore(db, key);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const product: ProductRow = {
    id: "p1",
    tenantId: "t1",
    name: "Paracetamol",
    sku: "SKU-1",
    barcode: "0001",
    costPrice: "10.0000",
    sellPrice: "12.5000",
    taxGroupId: null,
    productType: "medicine",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  const customer: CustomerRow = {
    id: "c1",
    tenantId: "t1",
    name: "John Doe",
    phone: "555-1234",
    email: "john@example.com",
    loyaltyPoints: 10,
    currentBalance: "0.0000",
    groupId: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  it("round-trips a product via upsertProduct/getProduct, preserving the decimal sellPrice string exactly", () => {
    store.upsertProduct(product);
    const found = store.getProduct("p1");
    expect(found).toEqual(product);
    expect(found?.sellPrice).toBe("12.5000");
  });

  it("upserting a product with the same id updates in place rather than duplicating", () => {
    store.upsertProduct(product);
    store.upsertProduct({ ...product, name: "Paracetamol 500mg", sellPrice: "13.0000" });

    const found = store.getProduct("p1");
    expect(found?.name).toBe("Paracetamol 500mg");
    expect(found?.sellPrice).toBe("13.0000");

    const count = db.prepare("SELECT COUNT(*) as c FROM products WHERE id=?").get("p1") as {
      c: number;
    };
    expect(count.c).toBe(1);
  });

  it("round-trips a customer via upsertCustomer/getCustomer", () => {
    store.upsertCustomer(customer);
    const found = store.getCustomer("c1");
    expect(found).toEqual(customer);
  });

  it("recordSale writes the sale, its items and payments atomically and emits exactly one pending outbox row", () => {
    const sale: SaleRow = {
      id: "s1",
      tenantId: "t1",
      storeId: "st1",
      invoiceNo: "INV-1",
      subtotal: "20.0000",
      taxTotal: "2.0000",
      grandTotal: "22.0000",
      paidAmount: "22.0000",
      dueAmount: "0.0000",
      changeAmount: "0.0000",
      status: "completed",
      cashierId: "u1",
      shiftId: "sh1",
      customerId: "c1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const item1: SaleItemRow = {
      id: "si1",
      saleId: "s1",
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
    const item2: SaleItemRow = {
      id: "si2",
      saleId: "s1",
      productId: "p2",
      variantId: null,
      quantity: "1",
      unitPrice: "0.0000",
      costPrice: "0.0000",
      discount: "0.0000",
      taxRate: "0.0000",
      taxAmount: "0.0000",
      lineTotal: "0.0000",
    };
    const payment: PaymentRow = {
      id: "pay1",
      tenantId: "t1",
      saleId: "s1",
      method: "cash",
      amount: "22.0000",
      referenceNo: null,
      status: "completed",
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    store.recordSale(sale, [item1, item2], [payment]);

    const found = store.getSale("s1");
    expect(found?.sale).toEqual(sale);
    expect(found?.items).toHaveLength(2);
    expect(found?.items.map((i) => i.id).sort()).toEqual(["si1", "si2"]);
    expect(found?.payments).toHaveLength(1);
    expect(found?.payments[0]).toEqual(payment);

    const outboxRows = db
      .prepare(
        "SELECT so.eventId FROM sync_outbox so JOIN sync_events se ON se.id = so.eventId WHERE se.entity='sales' AND se.entityId='s1' AND so.status='pending'",
      )
      .all();
    expect(outboxRows).toHaveLength(1);
  });

  it("getProduct returns null for an unknown id", () => {
    expect(store.getProduct("nope")).toBeNull();
  });

  it("getSale returns null for an unknown id", () => {
    expect(store.getSale("nope")).toBeNull();
  });
});
