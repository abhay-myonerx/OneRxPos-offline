import type { LocalDatabase } from "./database";

const DDL = `
CREATE TABLE IF NOT EXISTS tenants (id TEXT PRIMARY KEY, slug TEXT, settings TEXT, updatedAt TEXT);
CREATE TABLE IF NOT EXISTS stores (id TEXT PRIMARY KEY, tenantId TEXT, code TEXT, settings TEXT, updatedAt TEXT);
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, tenantId TEXT, storeId TEXT, role TEXT, passwordHash TEXT, updatedAt TEXT);
CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, tenantId TEXT, name TEXT, slug TEXT, parentId TEXT, updatedAt TEXT);
CREATE TABLE IF NOT EXISTS brands (id TEXT PRIMARY KEY, tenantId TEXT, name TEXT, slug TEXT, updatedAt TEXT);
CREATE TABLE IF NOT EXISTS tax_groups (id TEXT PRIMARY KEY, tenantId TEXT, name TEXT, rate TEXT, isInclusive INTEGER, updatedAt TEXT);
CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, tenantId TEXT, name TEXT, sku TEXT, barcode TEXT, costPrice TEXT, sellPrice TEXT, taxGroupId TEXT, productType TEXT, updatedAt TEXT);
CREATE TABLE IF NOT EXISTS product_variants (id TEXT PRIMARY KEY, productId TEXT, sku TEXT, barcode TEXT, sellPrice TEXT, updatedAt TEXT);
CREATE TABLE IF NOT EXISTS customer_groups (id TEXT PRIMARY KEY, tenantId TEXT, name TEXT, discountPercent TEXT, updatedAt TEXT);
CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, tenantId TEXT, name TEXT, phone TEXT, email TEXT, loyaltyPoints INTEGER, currentBalance TEXT, groupId TEXT, updatedAt TEXT);
CREATE TABLE IF NOT EXISTS store_stock (id TEXT PRIMARY KEY, storeId TEXT, productId TEXT, variantId TEXT, quantity INTEGER, lowStockThreshold INTEGER, updatedAt TEXT);
CREATE TABLE IF NOT EXISTS cashier_shifts (id TEXT PRIMARY KEY, tenantId TEXT, storeId TEXT, cashierId TEXT, openingCash TEXT, closingCash TEXT, openedAt TEXT, closedAt TEXT);
CREATE TABLE IF NOT EXISTS sales (id TEXT PRIMARY KEY, tenantId TEXT, storeId TEXT, invoiceNo TEXT, subtotal TEXT, taxTotal TEXT, grandTotal TEXT, paidAmount TEXT, dueAmount TEXT, changeAmount TEXT, status TEXT, cashierId TEXT, shiftId TEXT, customerId TEXT, createdAt TEXT, updatedAt TEXT);
CREATE TABLE IF NOT EXISTS sale_items (id TEXT PRIMARY KEY, saleId TEXT, productId TEXT, variantId TEXT, quantity TEXT, unitPrice TEXT, costPrice TEXT, discount TEXT, taxRate TEXT, taxAmount TEXT, lineTotal TEXT);
CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, tenantId TEXT, saleId TEXT, method TEXT, amount TEXT, referenceNo TEXT, status TEXT, createdAt TEXT);
CREATE TABLE IF NOT EXISTS sync_events (
  id TEXT PRIMARY KEY, entity TEXT NOT NULL, entityId TEXT NOT NULL, op TEXT NOT NULL,
  payload TEXT NOT NULL, tenantId TEXT, storeId TEXT, createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_outbox (
  eventId TEXT PRIMARY KEY REFERENCES sync_events(id), status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0, nextAttemptAt INTEGER, lastError TEXT
);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON sync_outbox(status, nextAttemptAt);
CREATE TABLE IF NOT EXISTS license_state (
  id INTEGER PRIMARY KEY CHECK (id = 1), lease TEXT NOT NULL, lastValidatedAt INTEGER NOT NULL
);
`;

export function initSchema(db: LocalDatabase): void {
  db.exec(DDL);
}
