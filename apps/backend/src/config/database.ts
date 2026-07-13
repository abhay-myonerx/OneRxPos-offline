import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
// The store-node sqlite client (prisma/schema.sqlite.prisma) is generated
// from the SAME model set as the Postgres schema, just `provider = "sqlite"`
// — its runtime model API (prisma.product.findMany(), $extends, etc.) is
// identical. We import it under an alias and cast it to the Postgres
// `PrismaClient` type at the one boundary where it's constructed (see
// `createSqlitePrismaClient` below) so every caller of `prisma` keeps a
// single type instead of a union threaded through the whole codebase.
import { PrismaClient as SqlitePrismaClient } from "@/generated/prisma-sqlite/client";
import { buildSqliteAdapter } from "@/local/sqlcipher-adapter";
import { deriveLocalDbKey } from "@/local/key-derivation";
import { config } from "./index";

// ─── Singleton Prisma Client ───────────────────────────────────────────────────

type GlobalWithPrisma = typeof globalThis & {
  prisma?: PrismaClient;
};

const globalForPrisma = globalThis as GlobalWithPrisma;

function createPostgresPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"],
  });
}

// Store-node local backend: a SQLCipher-encrypted SQLite file keyed from
// LOCAL_DB_MASTER_KEY + SYNC_DEVICE_ID (src/local/key-derivation.ts), opened
// via the same driver-adapter pattern as Postgres above (buildSqliteAdapter
// from Task 1, passed straight to `new SqlitePrismaClient({ adapter })`).
//
// Path source: `LOCAL_DB_PATH`, NOT `SQLITE_DATABASE_URL`. Both default to
// the same physical file, but `SQLITE_DATABASE_URL` is consumed by Prisma's
// own schema loader (prisma/schema.sqlite.prisma's `datasource url`), where
// relative paths resolve against the schema file's directory (prisma/).
// `buildSqliteAdapter` instead builds `"file:" + path` directly against a
// raw filesystem path, so using `LOCAL_DB_PATH` (CWD-relative, already used
// this way by `src/local/database.ts`) avoids a second, differently-rooted
// notion of "relative" for the same setting.
function createSqlitePrismaClient(): PrismaClient {
  if (!config.LOCAL_DB_MASTER_KEY) {
    throw new Error(
      "LOCAL_DB_MASTER_KEY environment variable is not set (required when DATA_BACKEND=sqlite)",
    );
  }

  const key = deriveLocalDbKey(config.LOCAL_DB_MASTER_KEY, config.SYNC_DEVICE_ID);
  const path = config.LOCAL_DB_PATH;

  // better-sqlite3 does not create missing parent directories on open —
  // mirrors the mkdirSync in src/local/database.ts#openLocalDb.
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

  const adapter = buildSqliteAdapter({ path, key });

  return new SqlitePrismaClient({ adapter }) as unknown as PrismaClient;
}

function createPrismaClient(): PrismaClient {
  return config.DATA_BACKEND === "sqlite"
    ? createSqlitePrismaClient()
    : createPostgresPrismaClient();
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

// Preserve singleton across hot-reloads in development
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// ─── Tenant-Scoped Client ──────────────────────────────────────────────────────
//
// The tenant-scoping strategy has TWO layers:
//
// 1. DIRECT_TENANT_MODELS — models that carry a `tenantId` column. The
//    extension injects `tenantId` into every WHERE clause for reads/mutations
//    and into every `data` payload for creates.
//
// 2. CHILD_MODEL_PARENT_RELATION — models that do NOT have a `tenantId`
//    column of their own but belong to a parent that does (e.g. `ProductVariant`
//    belongs to `Product`). For these, the extension injects a relation
//    filter like `{ product: { tenantId } }` into the WHERE clause so Prisma
//    generates a JOIN to the parent and enforces tenant scoping at the SQL
//    level.
//
// Without the child-model layer, any query like `prisma.storeStock.findMany()`
// or `prisma.productVariant.findFirst({ where: { barcode } })` would return
// rows from EVERY tenant in the database. This was the root cause of the
// cross-tenant product / inventory leak.

/**
 * Models that carry a `tenantId` column and are scoped by direct equality.
 */
// Intentionally NOT scoped here:
//   • Tenant            — the tenant table itself (global, not tenant-owned).
//   • MigrationAuditV1ToV2 — v1→v2 migration artifact with a NULLABLE tenant_id;
//     only ever touched by migration scripts via the raw client, never via a
//     per-tenant request client. (See TENANT_ISOLATION_AUDIT.md.)
//   • DrugProduct (Phase 2.1) — GLOBAL Health-Canada drug reference catalog keyed
//     by DIN. It has NO tenant_id column: it is reference data every tenant shares
//     (a tenant's Product.din soft-links into it). Because it carries no tenantId,
//     the schema-coverage guard in tenant-scope.test.ts does not flag it, and it
//     must NOT be added here — doing so would inject a non-existent tenantId filter.
// Exported so a regression test can assert every tenant-owned model is covered.
export const DIRECT_TENANT_MODELS = new Set<string>([
  // ── POS / inventory / sales core ─────────────────────────────────────
  "Product",
  "ProductSupplier",
  "Category",
  "Brand",
  "Store",
  "User",
  "Customer",
  "CustomerGroup",
  "Supplier",
  "Sale",
  "ParkedSale",
  "BarcodeTemplate",
  "DeviceProfile",
  "Payment",
  "PurchaseOrder",
  "Expense",
  "StockMovement",
  "Quotation",
  "GiftCard",
  "CashierShift",
  "CashMovement",
  "AuditLog",
  "Notification",
  "MessageLog",
  "Promotion",
  "PromotionRedemption",
  "ExpenseCategory",
  "TaxGroup",
  "Levy",
  "LoyaltyTransaction",
  "LoyaltyProgram",
  "StockTransfer",
  "ReceiptTemplate",
  "InvoiceSequence",
  // ── HRM: core ────────────────────────────────────────────────────────
  "Employee",
  "Department",
  "Designation",
  "EmployeeDocument",
  "EmploymentContract",
  // ── HRM: attendance & shifts ─────────────────────────────────────────
  "AttendanceRecord",
  "AttendanceCorrection",
  "WorkShift",
  "ShiftSchedule",
  "ShiftSwapRequest",
  // ── HRM: leave & holidays ────────────────────────────────────────────
  "LeaveType",
  "LeavePolicy",
  "LeaveBalance",
  "LeaveRequest",
  "Holiday",
  // ── HRM: payroll ─────────────────────────────────────────────────────
  "SalaryStructure",
  "SalaryComponent",
  "EmployeeSalary",
  "PayrollRun",
  "Payslip",
  "PayslipLine",
  "SalaryAdvance",
  // ── Licensing (Phase 0.5) ────────────────────────────────────────────
  "License",
  // ── Pharmacy (Phase 2.2) — Rx-at-till link (PII-free) ────────────────
  "RxLink",
  // ── Pharmacy (Phase 2.4) — controlled-substances / narcotic log (PII-free)
  "NarcoticEvent",
]);

/**
 * Child models that do NOT have a `tenantId` column but are scoped via a
 * parent relation that does. The value is the name of the Prisma relation
 * field on the child model that points to a tenant-scoped parent.
 *
 * Example: `StoreStock` → `{ product: { tenantId } }`
 */
export const CHILD_MODEL_PARENT_RELATION: Record<string, string> = {
  ProductVariant: "product",
  StoreStock: "product",
  SaleItem: "sale",
  SaleTaxLine: "sale",
  SaleOverride: "sale",
  ProductLevy: "product",
  PurchaseItem: "purchase",
  StockTransferItem: "transfer",
  QuotationItem: "quotation",
  LoyaltyTier: "program",
  RefreshToken: "user",
  DeviceActivation: "license",
};

const READ_OPERATIONS = new Set([
  "findMany",
  "findFirst",
  "findUnique",
  "findFirstOrThrow",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy",
]);

const WRITE_OPERATIONS = new Set(["create", "createMany"]);

const MUTATE_OPERATIONS = new Set(["update", "updateMany", "delete", "deleteMany", "upsert"]);

/**
 * Returns a Prisma extended client that automatically injects tenant scoping
 * into every query for tenant-owned models.
 *
 * @param tenantId - The UUID of the current tenant.
 */
export function createTenantClient(tenantId: string) {
  if (!tenantId || typeof tenantId !== "string") {
    throw new Error("createTenantClient: tenantId must be a non-empty string");
  }

  return prisma.$extends({
    name: "tenant-scope",
    query: {
      $allOperations({ model, operation, args, query }) {
        if (!model) return query(args);

        // ── Direct tenant-scoped models ──────────────────────────────
        if (DIRECT_TENANT_MODELS.has(model)) {
          return query(scopeDirect(tenantId, operation, args));
        }

        // ── Child models scoped via parent relation ──────────────────
        const parentRelation = CHILD_MODEL_PARENT_RELATION[model];
        if (parentRelation) {
          return query(scopeViaParent(tenantId, parentRelation, operation, args));
        }

        // Not a tenant-owned model — pass through untouched.
        return query(args);
      },
    },
  });
}

// ─── Scoping helpers ──────────────────────────────────────────────────────────

/**
 * Injects `tenantId` into the WHERE clause (for reads/mutations) and into the
 * `data` payload (for creates) of a direct tenant-scoped model.
 *
 * Returns a NEW args object — never mutates the caller's input.
 */
export function scopeDirect(
  tenantId: string,
  operation: string,
  args: unknown,
): Record<string, unknown> {
  const a = (args ?? {}) as Record<string, unknown>;
  const next: Record<string, unknown> = { ...a };

  if (READ_OPERATIONS.has(operation) || MUTATE_OPERATIONS.has(operation)) {
    // Force tenantId to our tenant — any caller-supplied tenantId is
    // overridden. Spread FIRST, tenantId LAST so ours wins.
    next.where = {
      ...((a.where as Record<string, unknown> | undefined) ?? {}),
      tenantId,
    };
  }

  if (WRITE_OPERATIONS.has(operation)) {
    if (operation === "createMany" && Array.isArray(a.data)) {
      next.data = (a.data as Record<string, unknown>[]).map((row) => ({
        ...row,
        tenantId,
      }));
    } else if (a.data && typeof a.data === "object") {
      next.data = {
        ...(a.data as Record<string, unknown>),
        tenantId,
      };
    }
  }

  if (operation === "upsert") {
    // upsert has both `create` and `update` payloads, plus `where`.
    // `where` is already handled above; inject into create/update too.
    const create = (a.create as Record<string, unknown> | undefined) ?? {};
    const update = (a.update as Record<string, unknown> | undefined) ?? {};
    next.create = { ...create, tenantId };
    next.update = { ...update };
  }

  return next;
}

/**
 * Injects a parent-relation filter (e.g. `{ product: { tenantId } }`) into
 * the WHERE clause so the DB-level JOIN enforces tenant scoping on child
 * models that don't carry a tenantId column of their own.
 *
 * Creates are not scoped here because child models inherit tenancy through
 * their foreign key to the parent — as long as the parent was created under
 * the correct tenant (which the direct-scoping layer enforces), the child
 * row can only reference a parent that belongs to the correct tenant.
 *
 * Returns a NEW args object.
 */
export function scopeViaParent(
  tenantId: string,
  relation: string,
  operation: string,
  args: unknown,
): Record<string, unknown> {
  const a = (args ?? {}) as Record<string, unknown>;

  // Only inject on reads and mutations. Creates pass through untouched.
  if (!READ_OPERATIONS.has(operation) && !MUTATE_OPERATIONS.has(operation)) {
    return a;
  }

  const existingWhere = (a.where as Record<string, unknown> | undefined) ?? {};
  const existingParentFilter =
    (existingWhere[relation] as Record<string, unknown> | undefined) ?? {};

  return {
    ...a,
    where: {
      ...existingWhere,
      [relation]: {
        ...existingParentFilter,
        tenantId,
      },
    },
  };
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export type TenantPrismaClient = ReturnType<typeof createTenantClient>;
