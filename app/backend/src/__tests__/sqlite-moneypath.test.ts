// SN-1 Task 5 — Money-path acceptance smoke on the encrypted SQLite backend.
//
// This is the SN-1 acceptance gate: it proves the whole RX POS domain runs on
// the SQLCipher-encrypted local DB. Unlike the other route tests in this repo
// (which mock `../config/database`), this test uses the REAL resolved client
// with DATA_BACKEND=sqlite pointed at a temp encrypted file, then drives the
// core money-path end-to-end over HTTP against the real Express `app`:
//
//   login → create store(ON) → create product → set stock → open till
//         → checkout (CASH) → build receipt job
//
// It asserts exact money/tax/change Decimal values (money precision is the
// whole point), that every row (Sale / SaleItem / SaleTaxLine / Payment)
// persisted, and — throughout — that the data lives ONLY in the genuinely
// encrypted SQLite file (non-plaintext header, Sale row queryable through the
// sqlite-resolved client), with no Postgres connection involved.
//
// Env isolation mirrors Task 4's precedent exactly (vi.stubEnv +
// clearPrismaSingleton + vi.resetModules) so a leftover DATA_BACKEND=sqlite /
// stale LOCAL_DB_PATH never bleeds into the next test file in this worker.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import supertest from "supertest";
import type { Express } from "express";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Stub the Redis infra module. Redis is NOT part of "the RX POS domain on
// encrypted SQLite" this task proves — it's rate-limiter/queue infrastructure
// (made optional at boot in SN-2). Without a live Redis, `authRateLimiter`
// fails CLOSED (503) and blocks the login endpoint, so an in-memory fake lets
// the money-path drive over real HTTP. `incr` keeps a real counter (so the
// limiter's arithmetic runs); every other command is an async no-op.
vi.mock("../config/redis", () => {
  const counters = new Map<string, number>();
  const redis = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "incr") {
          return async (k: string) => {
            const n = (counters.get(k) ?? 0) + 1;
            counters.set(k, n);
            return n;
          };
        }
        // Not a thenable — must not look like a Promise.
        if (prop === "then") return undefined;
        return async () => null;
      },
    },
  );
  return {
    redis,
    redisSubscriber: redis,
    disconnectRedis: async () => {},
    bullMQConnection: { maxRetriesPerRequest: null },
    // SN-2: the rate limiters route through hitRateLimit, which checks these.
    // Reporting Redis as not-ready exercises the in-memory fallback — exactly
    // the store-node (Redis-optional) path this money-path proves.
    isRedisReady: () => false,
    isRedisOptional: () => true,
    setRedisReady: () => {},
  };
});

// The Prisma singleton in `src/config/database.ts` is cached on
// `globalThis.prisma` outside NODE_ENV==="production". `vi.resetModules()`
// only clears vitest's module registry — not globalThis — so we also delete
// the cached instance before the first `../config/database` import to force a
// fresh client build against the freshly-stubbed sqlite env.
type GlobalWithPrisma = typeof globalThis & { prisma?: { $disconnect(): Promise<void> } };

function clearPrismaSingleton(): void {
  delete (globalThis as GlobalWithPrisma).prisma;
}

const SEED_EMAIL = "admin@storenode.local";
const SEED_PASSWORD = "ChangeMe123!StoreNode";

describe("money-path on encrypted SQLite (SN-1 Task 5 — acceptance gate)", () => {
  let dir: string;
  let dbPath: string;
  let app: Express;
  // Prisma client resolved against the encrypted sqlite file — used for
  // out-of-band assertions that a row actually persisted to the local DB.
  let db: any;
  let token: string;

  const masterKey = "test-master-key-for-moneypath-0123456789abcdef0123456789";
  const deviceId = "test-device-moneypath";

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "rxpos-moneypath-"));
    dbPath = join(dir, "sn1-moneypath.db");

    vi.resetModules();
    clearPrismaSingleton();

    vi.stubEnv("DATA_BACKEND", "sqlite");
    vi.stubEnv("LOCAL_DB_PATH", dbPath);
    vi.stubEnv("LOCAL_DB_MASTER_KEY", masterKey);
    vi.stubEnv("SYNC_DEVICE_ID", deviceId);

    // Push the schema + seed the SUPER_ADMIN into the encrypted file BEFORE the
    // app (and thus the shared prisma singleton) is imported. `pushSqliteSchema`
    // takes an explicit path/key; `seedSuperAdminSqlite` + `app` both resolve
    // the singleton against the SAME LOCAL_DB_PATH, so there is one file, one
    // client, one handle.
    const { deriveLocalDbKey } = await import("../local/key-derivation");
    const { pushSqliteSchema } = await import("../local/sqlite-push");
    const key = deriveLocalDbKey(masterKey, deviceId);
    await pushSqliteSchema({ path: dbPath, key });

    const { seedSuperAdminSqlite } = await import("../local/seed-super-admin-sqlite");
    await seedSuperAdminSqlite();

    ({ prisma: db } = await import("../config/database"));
    app = (await import("../app")).default;
  }, 60_000); // `migrate diff` shells out to the prisma CLI — slower than 5s.

  afterAll(async () => {
    // Release the better-sqlite3 file handle before deleting the temp dir —
    // Windows throws EPERM on rmSync while the file is still open.
    try {
      await db?.$disconnect();
    } catch {
      /* ignore */
    }
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
    vi.unstubAllEnvs();
    clearPrismaSingleton();
    vi.resetModules();
  });

  it("the seeded file is genuinely encrypted (non-plaintext SQLite header)", () => {
    const header = readFileSync(dbPath).subarray(0, 16).toString("latin1");
    expect(header.startsWith("SQLite format 3")).toBe(false);
  });

  it("logs in as the seeded SUPER_ADMIN over HTTP → issues an access token", async () => {
    const res = await supertest(app)
      .post("/api/v1/auth/login")
      .send({ email: SEED_EMAIL, password: SEED_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.role).toBe("SUPER_ADMIN");
    expect(res.body.data.accessToken).toBeTruthy();
    token = res.body.data.accessToken as string;

    // The password hash the seed wrote (argon2id) verified through the normal
    // auth login path, out of the encrypted file — no Postgres involved.
    const persisted = await db.user.findFirst({ where: { email: SEED_EMAIL } });
    expect(persisted).toBeTruthy();
    expect(persisted.role).toBe("SUPER_ADMIN");
  });

  // These ids thread through the money-path steps below.
  let storeId: string;
  let productId: string;
  let shiftId: string;
  let saleId: string;

  it("creates a store (province ON) over HTTP", async () => {
    const res = await supertest(app)
      .post("/api/v1/stores")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Money-Path Store", code: "MP1", province: "ON" });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    storeId = res.body.data.id;
    expect(storeId).toBeTruthy();
    expect(res.body.data.province).toBe("ON");
  });

  it("creates a $100 STANDARD product over HTTP", async () => {
    const res = await supertest(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Widget",
        sku: "WIDGET-1",
        costPrice: 40,
        sellPrice: 100,
        productType: "STANDARD",
        taxCategory: "STANDARD",
        taxInclusive: false,
      });

    expect(res.status).toBe(201);
    productId = res.body.data.id;
    expect(productId).toBeTruthy();
  });

  it("sets on-hand stock to 10 over HTTP", async () => {
    const res = await supertest(app)
      .post("/api/v1/inventory/stock/set")
      .set("Authorization", `Bearer ${token}`)
      .send({ storeId, productId, quantity: 10 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Booked into the encrypted local DB.
    const stock = await db.storeStock.findFirst({ where: { storeId, productId } });
    expect(stock.quantity).toBe(10);
  });

  it("opens a cashier shift (till float $200) over HTTP", async () => {
    const res = await supertest(app)
      .post("/api/v1/cashier-shifts/open")
      .set("Authorization", `Bearer ${token}`)
      .send({ storeId, openingCounts: { "100": 2 } });

    expect(res.status).toBe(200);
    expect(res.body.data.openingCash).toBe(200);
    shiftId = res.body.data.id;
    expect(shiftId).toBeTruthy();
  });

  it("rings up a CASH sale via POST /sales/checkout with correct money math", async () => {
    // $100 STANDARD in ON → HST 13% = $13.00 → grand $113.00.
    // Tender $120 cash → change $7.00 (113.00 is already a nickel multiple,
    // so rounding adjustment is 0).
    const res = await supertest(app)
      .post("/api/v1/sales/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({
        storeId,
        shiftId,
        items: [{ productId, quantity: 1, unitPrice: 100 }],
        payments: [{ method: "CASH", amount: 120 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    saleId = res.body.data.id;
    expect(saleId).toBeTruthy();
    expect(res.body.data.status).toBe("COMPLETED");

    // ── Exact money values, read straight out of the encrypted sqlite file ──
    const sale = await db.sale.findUnique({
      where: { id: saleId },
      include: { items: true, taxLines: true, payments: true },
    });

    expect(sale).toBeTruthy();
    expect(sale.shiftId).toBe(shiftId);
    expect(sale.status).toBe("COMPLETED");
    expect(Number(sale.subtotal)).toBe(100);
    expect(Number(sale.taxTotal)).toBe(13);
    expect(Number(sale.levyTotal)).toBe(0);
    expect(Number(sale.discountAmount)).toBe(0);
    expect(Number(sale.roundingAdjustment)).toBe(0);
    expect(Number(sale.grandTotal)).toBe(113);
    expect(Number(sale.paidAmount)).toBe(113);
    expect(Number(sale.dueAmount)).toBe(0);
    expect(Number(sale.changeAmount)).toBe(7);

    // ── SaleItem persisted ──────────────────────────────────────────────────
    expect(sale.items).toHaveLength(1);
    expect(sale.items[0].productId).toBe(productId);
    expect(sale.items[0].quantity).toBe(1);
    expect(Number(sale.items[0].unitPrice)).toBe(100);

    // ── SaleTaxLine persisted (ON HST single component) ─────────────────────
    expect(sale.taxLines).toHaveLength(1);
    expect(sale.taxLines[0].componentCode).toBe("HST");
    expect(Number(sale.taxLines[0].base)).toBe(100);
    expect(Number(sale.taxLines[0].amount)).toBe(13);

    // ── Payment persisted ───────────────────────────────────────────────────
    expect(sale.payments).toHaveLength(1);
    expect(sale.payments[0].method).toBe("CASH");
    expect(Number(sale.payments[0].amount)).toBe(120);

    // ── Stock deducted 10 → 9 in the same encrypted DB ──────────────────────
    const stock = await db.storeStock.findFirst({ where: { storeId, productId } });
    expect(stock.quantity).toBe(9);
  });

  it("builds the sale receipt job via POST /receipts/sale/:id/print (printer soft-fail OK)", async () => {
    const res = await supertest(app)
      .post(`/api/v1/receipts/sale/${saleId}/print`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    // The receipt CONTENT/JOB builds from the persisted sale; the network send
    // soft-fails (200 { ok:false }) because no printer/DeviceProfile is
    // configured. That is the acceptance criterion — the job built, not that a
    // physical printer answered.
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.ok).toBe(false);
    expect(res.body.data.reason).toBe("no-printer-configured");
  });

  it("proves the sale round-trips through the sqlite-resolved client (no Postgres)", async () => {
    // Independent read via the resolved client (the same resolver src/config
    // uses at runtime) — the Sale invoice + total survive a fresh query.
    const found = await db.sale.findFirst({ where: { storeId }, orderBy: { createdAt: "desc" } });
    expect(found.id).toBe(saleId);
    expect(found.invoiceNo).toBeTruthy();
    expect(Number(found.grandTotal)).toBe(113);

    // And the on-disk file is still the encrypted one we asserted at the top.
    const header = readFileSync(dbPath).subarray(0, 16).toString("latin1");
    expect(header.startsWith("SQLite format 3")).toBe(false);
  });

  // ── SN-2 money-storage decision lock ──────────────────────────────────────
  // The @prisma/adapter-better-sqlite3 driver round-trips Decimal through
  // float64 (write = Number.parseFloat(value); read = JS number re-wrapped in
  // decimal.js). DECISION: keep `Decimal` — NO integer-cents migration. For POS
  // money (≤2 decimal places, bounded to millions) the round-trip is EXACT,
  // because decimal.js reconstructs from the number's shortest round-trip
  // string and float64 represents such values without loss. This test LOCKS
  // that guarantee end-to-end with "nasty" fractional cents ($19.99), so any
  // future regression (e.g. doing float math on a raw read) fails loudly.
  // $19.99 × 5 = $99.95 (a nickel multiple), EXEMPT → no tax, no cash-rounding,
  // isolating the fractional-cent STORAGE precision that is the whole concern.
  let fracProductId: string;

  it("stores a fractional-cent price ($19.99) with no float drift", async () => {
    const res = await supertest(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Fractional Widget",
        sku: "FRAC-1999",
        costPrice: 9.99,
        sellPrice: 19.99,
        productType: "STANDARD",
        taxCategory: "EXEMPT",
        taxInclusive: false,
      });
    expect(res.status).toBe(201);
    fracProductId = res.body.data.id;

    // The $19.99 sell price survives the encrypted-SQLite round-trip exactly —
    // not 19.98999… — read straight back out of the file.
    const stored = await db.product.findUnique({ where: { id: fracProductId } });
    expect(Number(stored.sellPrice)).toBe(19.99);
    expect(stored.sellPrice.toString()).toBe("19.99");

    await supertest(app)
      .post("/api/v1/inventory/stock/set")
      .set("Authorization", `Bearer ${token}`)
      .send({ storeId, productId: fracProductId, quantity: 10 })
      .expect(200);
  });

  it("rings up $19.99 × 5 = $99.95 EXEMPT with exact fractional money math", async () => {
    const res = await supertest(app)
      .post("/api/v1/sales/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({
        storeId,
        shiftId,
        items: [{ productId: fracProductId, quantity: 5, unitPrice: 19.99 }],
        payments: [{ method: "CASH", amount: 100 }],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("COMPLETED");

    const sale = await db.sale.findUnique({
      where: { id: res.body.data.id },
      include: { items: true },
    });
    // Fractional-cent storage precision, exact to the cent:
    expect(Number(sale.items[0].unitPrice)).toBe(19.99); // 19.99 stored exact
    expect(Number(sale.subtotal)).toBe(99.95); // 19.99 × 5, no float drift
    expect(Number(sale.taxTotal)).toBe(0); // EXEMPT
    expect(Number(sale.grandTotal)).toBe(99.95);
    expect(Number(sale.roundingAdjustment)).toBe(0); // 99.95 is a nickel multiple
    expect(Number(sale.paidAmount)).toBe(99.95);
    expect(Number(sale.changeAmount)).toBe(0.05); // 100.00 − 99.95, exact
  });

  // ── SN-3 Task 4 — end-to-end acceptance: sale → outbox → drain ────────────
  // The trigger-capture (SN-3 Task 1) + drainer (SN-3 Task 2) proved
  // themselves in isolation against hand-pushed fixture DBs. This closes the
  // loop against the SAME real HTTP money-path this whole file drives: the
  // ORIGINAL cash sale (`saleId`, checked out with NO cloud configured above)
  // must have captured `sync_outbox` rows for every table its checkout wrote
  // to, and a stub cloud must be able to drain them — proving the offline
  // capture and the best-effort drain both work against genuine domain writes,
  // not synthetic ones.

  it("offline capture: the completed cash sale left pending sync_outbox rows with NO cloud configured", async () => {
    // `sales` — exactly the completed sale, captured as an insert.
    const saleRows = await db.syncOutbox.findMany({
      where: { entity: "sales", entityId: saleId },
    });
    expect(saleRows.length).toBeGreaterThanOrEqual(1);
    for (const row of saleRows) {
      expect(row.op).toBe("insert");
      expect(row.status).toBe("pending");
    }

    // `sale_items`, `payments`, `store_stock` (the stock decrement) — the
    // checkout's other writes, also captured atomically by the triggers.
    const [saleItemRows, paymentRows, stockRows] = await Promise.all([
      db.syncOutbox.findMany({ where: { entity: "sale_items", status: "pending" } }),
      db.syncOutbox.findMany({ where: { entity: "payments", status: "pending" } }),
      db.syncOutbox.findMany({ where: { entity: "store_stock", status: "pending" } }),
    ]);
    expect(saleItemRows.length).toBeGreaterThanOrEqual(1);
    expect(paymentRows.length).toBeGreaterThanOrEqual(1);
    expect(stockRows.length).toBeGreaterThanOrEqual(1);

    // The sale completed (asserted earlier) with zero cloud configuration —
    // this is the offline-first invariant: capture happened, nothing blocked.
  });

  it("stub-cloud drain: pending rows flip to synced and the real sale row travels encrypted", async () => {
    const { deriveLocalDbKey } = await import("../local/key-derivation");
    const { decryptEvent } = await import("../local/event-crypto");
    const { drainOutbox } = await import("../sync/store-node/outbox-drainer");
    const { getFreshness } = await import("../sync/store-node/freshness");

    const key = deriveLocalDbKey(masterKey, deviceId);

    const pendingBefore = await db.syncOutbox.findMany({ where: { status: "pending" } });
    expect(pendingBefore.length).toBeGreaterThanOrEqual(4); // sales/sale_items/payments/store_stock, at minimum

    const capturedBodies: { events: { id: string; entity: string; op: string; payload: string }[] }[] = [];
    const fetchImpl = (async (url: string, init?: { body?: string }) => {
      capturedBodies.push(JSON.parse(init!.body!));
      return { ok: true, status: 200, json: async () => ({}) };
    }) as unknown as typeof fetch;

    const result = await drainOutbox(db, {
      cloudUrl: "https://cloud.test",
      token: "t",
      key,
      fetchImpl,
    });

    expect(result.pushed).toBeGreaterThanOrEqual(pendingBefore.length);
    expect(result.failed).toBe(0);

    // The rows that were pending before the drain are now synced.
    const stillPending = await db.syncOutbox.count({
      where: { id: { in: pendingBefore.map((r: { id: string }) => r.id) }, status: "pending" },
    });
    expect(stillPending).toBe(0);

    // At least one captured POST body's payload decrypts to the real sale —
    // proving the encrypted-at-drain-time payload actually carries the money
    // row, not a placeholder.
    const allEvents = capturedBodies.flatMap((b) => b.events);
    const saleEvent = allEvents.find((e) => {
      if (e.entity !== "sales") return false;
      try {
        const decrypted = JSON.parse(decryptEvent(e.payload, key)) as {
          entity: string;
          entityId: string;
          op: string;
          data: { id: string } | null;
        };
        return decrypted.data?.id === saleId;
      } catch {
        return false;
      }
    });
    expect(saleEvent).toBeDefined();
    // Ciphertext on the wire must not leak the plaintext id.
    expect(saleEvent!.payload).not.toContain(saleId);

    const decrypted = JSON.parse(decryptEvent(saleEvent!.payload, key)) as {
      entity: string;
      entityId: string;
      op: string;
      data: { id: string } | null;
    };
    expect(decrypted.entity).toBe("sales");
    expect(decrypted.op).toBe("insert");
    expect(decrypted.data).not.toBeNull();
    expect(decrypted.data!.id).toBe(saleId);

    const fresh = await getFreshness(db);
    expect(fresh.pending).toBe(0);
    expect(fresh.lastSyncedAt).not.toBeNull();
  });
});
