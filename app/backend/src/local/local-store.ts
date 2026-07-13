import type { LocalDatabase } from "@/local/database";
import { appendEvent } from "@/sync/event-log";
import type {
  CustomerRow,
  LocalStore,
  PaymentRow,
  ProductRow,
  SaleItemRow,
  SaleRow,
} from "./local-store.types";

export function createLocalStore(db: LocalDatabase, key: Buffer): LocalStore {
  const upsertProductStmt = db.prepare(`
    INSERT INTO products (id, tenantId, name, sku, barcode, costPrice, sellPrice, taxGroupId, productType, updatedAt)
    VALUES (@id, @tenantId, @name, @sku, @barcode, @costPrice, @sellPrice, @taxGroupId, @productType, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      tenantId = excluded.tenantId,
      name = excluded.name,
      sku = excluded.sku,
      barcode = excluded.barcode,
      costPrice = excluded.costPrice,
      sellPrice = excluded.sellPrice,
      taxGroupId = excluded.taxGroupId,
      productType = excluded.productType,
      updatedAt = excluded.updatedAt
  `);

  const getProductStmt = db.prepare("SELECT * FROM products WHERE id=?");

  const upsertCustomerStmt = db.prepare(`
    INSERT INTO customers (id, tenantId, name, phone, email, loyaltyPoints, currentBalance, groupId, updatedAt)
    VALUES (@id, @tenantId, @name, @phone, @email, @loyaltyPoints, @currentBalance, @groupId, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      tenantId = excluded.tenantId,
      name = excluded.name,
      phone = excluded.phone,
      email = excluded.email,
      loyaltyPoints = excluded.loyaltyPoints,
      currentBalance = excluded.currentBalance,
      groupId = excluded.groupId,
      updatedAt = excluded.updatedAt
  `);

  const getCustomerStmt = db.prepare("SELECT * FROM customers WHERE id=?");

  const insertSaleStmt = db.prepare(`
    INSERT INTO sales (id, tenantId, storeId, invoiceNo, subtotal, taxTotal, grandTotal, paidAmount, dueAmount, changeAmount, status, cashierId, shiftId, customerId, createdAt, updatedAt)
    VALUES (@id, @tenantId, @storeId, @invoiceNo, @subtotal, @taxTotal, @grandTotal, @paidAmount, @dueAmount, @changeAmount, @status, @cashierId, @shiftId, @customerId, @createdAt, @updatedAt)
  `);

  const insertSaleItemStmt = db.prepare(`
    INSERT INTO sale_items (id, saleId, productId, variantId, quantity, unitPrice, costPrice, discount, taxRate, taxAmount, lineTotal)
    VALUES (@id, @saleId, @productId, @variantId, @quantity, @unitPrice, @costPrice, @discount, @taxRate, @taxAmount, @lineTotal)
  `);

  const insertPaymentStmt = db.prepare(`
    INSERT INTO payments (id, tenantId, saleId, method, amount, referenceNo, status, createdAt)
    VALUES (@id, @tenantId, @saleId, @method, @amount, @referenceNo, @status, @createdAt)
  `);

  const getSaleStmt = db.prepare("SELECT * FROM sales WHERE id=?");
  const getSaleItemsStmt = db.prepare("SELECT * FROM sale_items WHERE saleId=?");
  const getSalePaymentsStmt = db.prepare("SELECT * FROM payments WHERE saleId=?");

  const recordSaleTx = db.transaction(
    (sale: SaleRow, items: SaleItemRow[], payments: PaymentRow[]) => {
      insertSaleStmt.run(sale);
      for (const item of items) insertSaleItemStmt.run(item);
      for (const payment of payments) insertPaymentStmt.run(payment);
      appendEvent(db, key, {
        entity: "sales",
        entityId: sale.id,
        op: "insert",
        data: { sale, items, payments },
        tenantId: sale.tenantId ?? undefined,
        storeId: sale.storeId ?? undefined,
      });
    },
  );

  return {
    upsertProduct(p: ProductRow): void {
      upsertProductStmt.run(p);
    },
    getProduct(id: string): ProductRow | null {
      return (getProductStmt.get(id) as ProductRow | undefined) ?? null;
    },
    upsertCustomer(c: CustomerRow): void {
      upsertCustomerStmt.run(c);
    },
    getCustomer(id: string): CustomerRow | null {
      return (getCustomerStmt.get(id) as CustomerRow | undefined) ?? null;
    },
    recordSale(sale: SaleRow, items: SaleItemRow[], payments: PaymentRow[]): void {
      recordSaleTx(sale, items, payments);
    },
    getSale(id: string): { sale: SaleRow; items: SaleItemRow[]; payments: PaymentRow[] } | null {
      const sale = getSaleStmt.get(id) as SaleRow | undefined;
      if (!sale) return null;
      const items = getSaleItemsStmt.all(id) as SaleItemRow[];
      const payments = getSalePaymentsStmt.all(id) as PaymentRow[];
      return { sale, items, payments };
    },
  };
}
