// Re-export Prisma enums so modules can import from one place
// without reaching into the generated folder directly.
export {
  Role,
  TenantStatus,
  TenantPlan,
  ProductType,
  StockMovementType,
  SaleStatus,
  PaymentMethod,
  PaymentStatus,
  PurchaseStatus,
  QuotationStatus,
  TransferStatus,
  LoyaltyTransactionType,
} from "../../generated/prisma/enums";

// ─── Permission strings ────────────────────────────────────────────────────────
// Centralised list of all permission tokens used by authorize() middleware.

export const PERMISSIONS = {
  // Tenant
  TENANT_MANAGE: "tenant:manage",

  // Store
  STORE_MANAGE: "store:manage",

  // Users
  USER_MANAGE: "user:manage",
  USER_MANAGE_STORE: "user:manage:store",
  USER_PIN_RESET: "user:pin:reset",

  // Products & categories
  PRODUCT_READ: "product:read",
  PRODUCT_WRITE: "product:write",
  CATEGORY_READ: "category:read",
  CATEGORY_WRITE: "category:write",

  // Inventory
  INVENTORY_READ: "inventory:read",
  INVENTORY_WRITE: "inventory:write",

  // Sales
  SALE_CREATE: "sale:create",
  SALE_READ: "sale:read",
  SALE_READ_OWN: "sale:read:own",
  SALE_VOID: "sale:void",
  SALE_RETURN: "sale:return",
  SALE_DISCOUNT_OVERRIDE: "sale:discount:override",
  SALE_CREDIT_OVERRIDE: "sale:credit:override",
  PRICE_OVERRIDE: "price:override",

  // Pharmacy (Phase 2.2) — pharmacist behind-counter consult authorization.
  // Held by the roles that can authorize overrides (no dedicated PHARMACIST
  // role yet; the "pharmacist" is whoever holds this permission).
  RX_CONSULT: "rx:consult",

  // Devices (Phase 1.1 pos-auth)
  DEVICE_ENROLL: "device:enroll",
  DEVICE_REVOKE: "device:revoke",

  // Purchases
  PURCHASE_READ: "purchase:read",
  PURCHASE_WRITE: "purchase:write",
  PURCHASE_RECEIVE: "purchase:receive",

  // Customers & suppliers
  CUSTOMER_READ: "customer:read",
  CUSTOMER_WRITE: "customer:write",
  SUPPLIER_READ: "supplier:read",
  SUPPLIER_WRITE: "supplier:write",

  // Expenses
  EXPENSE_READ: "expense:read",
  EXPENSE_WRITE: "expense:write",

  // Reports
  REPORT_READ: "report:read",
  REPORT_READ_OWN: "report:read:own",
  REPORT_EXPORT: "report:export",

  // Shifts
  SHIFT_MANAGE: "shift:manage",
  SHIFT_OWN: "shift:own",

  // Settings
  SETTINGS_MANAGE: "settings:manage",

  // Receipt
  RECEIPT_READ: "receipt:read",
  RECEIPT_WRITE: "receipt:write",
  RECEIPT_GENERATE: "receipt:generate",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
