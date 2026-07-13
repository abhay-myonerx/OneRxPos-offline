// SN-4 Task 4 (final): the offline acceptance test.
//
// Drives the REAL rx-pos-backend, launched through the DESKTOP's OWN
// `ensureStoreNodeReady` + `startStoreNode` (not a hand-rolled spawn), against
// a fresh temp `LOCAL_DB_PATH` + freshly generated secrets, with NO cloud
// configured (SYNC_CLOUD_URL stripped from the child's env) to simulate a
// store-node that has never seen the internet. Proves, end to end:
//
//   Round 1 (first launch): schema push -> health -> setup -> login -> a full
//   CASH sale over HTTP -> the SN-3 sync_outbox accumulated pending rows with
//   no cloud configured.
//
//   Round 2 (relaunch, same dbPath): no re-push -> health -> login -> the
//   Round-1 sale PERSISTS with the same grandTotal.
//
// This is an integration test against the real backend process (not mocks) —
// it needs `cd rx-pos-backend && npm run build` to have produced
// dist/server.js first (startStoreNode throws a clear, actionable error
// otherwise) and the desktop's private Electron-targeted native module copy
// to exist (`npm run rebuild:native:backend`), which it already does in this
// repo (see native/node_modules/better-sqlite3-multiple-ciphers).
import { type ChildProcess, spawn as nodeSpawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import electronPath from "electron";
import { afterAll, describe, expect, it } from "vitest";
import {
  startStoreNode,
  storeNodeDbPath,
  type StoreNodeHandle,
} from "../launcher";
import { deriveStoreNodeDbKey, ensureStoreNodeReady } from "../onboarding";
import { loadOrCreateStoreNodeSecrets } from "../store-node-config";

const desktopDir = path.resolve(__dirname, "..", "..", "..");
const backendDir = path.resolve(desktopDir, "..", "rx-pos-backend");

// WATCH-SN4-1 override (see rebuild-native-backend.mjs / main.ts): the
// private, Electron-ABI-146-targeted copy of better-sqlite3-multiple-ciphers,
// redirected to via a --require hook for every child this harness spawns
// (the schema-push one-shot, the real server, and the outbox-count one-shot
// below) — the EXACT same wiring main.ts uses in production.
const electronNativeOverride = {
  hookPath: path.join(
    desktopDir,
    "scripts",
    "electron-native-require-hook.cjs",
  ),
  sqlcipherEntry: path.join(
    desktopDir,
    "native",
    "node_modules",
    "better-sqlite3-multiple-ciphers",
  ),
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: { message: string };
}

async function api<T>(
  baseUrl: string,
  method: string,
  urlPath: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<{ status: number; json: ApiEnvelope<T> }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const json = (await res.json()) as ApiEnvelope<T>;
  return { status: res.status, json };
}

// Known pre-existing backend bug (out of scope to fix here): `login()`
// mints a refresh-token JWT keyed only on {sub, iat-in-seconds}; two logins
// for the same user within the same wall-clock second produce byte-identical
// tokens, which collide against RefreshToken.token's UNIQUE constraint and
// surface as a 409. This is a TEST-HARNESS accommodation, not a product fix:
// retry a few times, ~1.1s apart, so the race window (< 1s) is reliably
// cleared.
async function loginWithRetry(
  baseUrl: string,
  email: string,
  password: string,
): Promise<{
  accessToken: string;
  user: { id: string; role: string };
  tenant: { id: string };
}> {
  const attempts = 3;
  let lastFailure: { status: number; json: ApiEnvelope<unknown> } | undefined;
  for (let i = 0; i < attempts; i++) {
    const result = await api<{
      accessToken: string;
      user: { id: string; role: string };
      tenant: { id: string };
    }>(baseUrl, "POST", "/api/v1/auth/login", { body: { email, password } });
    if (result.status === 200) return result.json.data;
    lastFailure = result;

    console.log(
      `[offline-acceptance] login attempt ${i + 1}/${attempts} got ${result.status} ` +
        `(${result.json.error?.message ?? "unknown"}) — retrying in 1.1s ` +
        `(known RefreshToken same-second 409 race, harness accommodation)`,
    );
    if (i < attempts - 1) await sleep(1100);
  }
  throw new Error(
    `loginWithRetry: exhausted ${attempts} attempts — last: ${lastFailure?.status} ` +
      JSON.stringify(lastFailure?.json),
  );
}

interface OutboxCounts {
  pending: number;
  total: number;
}

// Queries `sync_outbox` directly off the encrypted DB file via a one-shot
// child (scripts/query-outbox-count-oneshot.cjs), same electron-as-node +
// native-override convention as the schema-push one-shot in onboarding.ts.
function queryOutboxCounts(opts: {
  dbPath: string;
  keyHex: string;
}): Promise<OutboxCounts> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(
      desktopDir,
      "scripts",
      "query-outbox-count-oneshot.cjs",
    );
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      RXPOS_QUERY_DB_PATH: opts.dbPath,
      RXPOS_QUERY_DB_KEY_HEX: opts.keyHex,
      RXPOS_NATIVE_SQLCIPHER_ENTRY: electronNativeOverride.sqlcipherEntry,
    };
    const child: ChildProcess = nodeSpawn(
      electronPath as unknown as string,
      ["--require", electronNativeOverride.hookPath, scriptPath],
      { env, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (c: Buffer) => (stdout += c.toString()));
    child.stderr?.on("data", (c: Buffer) => (stderr += c.toString()));
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code !== 0) {
        reject(
          new Error(`queryOutboxCounts: one-shot exited ${code}\n${stderr}`),
        );
        return;
      }
      try {
        const line = stdout.trim().split("\n").filter(Boolean).pop() ?? "{}";
        resolve(JSON.parse(line) as OutboxCounts);
      } catch (err) {
        reject(
          new Error(
            `queryOutboxCounts: failed to parse stdout "${stdout}": ${String(err)}`,
          ),
        );
      }
    });
  });
}

describe("SN-4 Task 4: offline launch -> sell -> relaunch acceptance", () => {
  let userDataDir: string | undefined;
  let handle: StoreNodeHandle | undefined;

  afterAll(async () => {
    if (handle) {
      await handle.stop().catch(() => {});
      handle = undefined;
    }
    if (userDataDir) {
      rmSync(userDataDir, { recursive: true, force: true });
      userDataDir = undefined;
    }
  });

  it("onboards, sells, and persists the sale across a relaunch — fully offline, through the real launcher", async () => {
    userDataDir = mkdtempSync(path.join(tmpdir(), "rxpos-offline-acceptance-"));
    const dbPath = storeNodeDbPath(userDataDir);

    // Fresh, real secrets — the same call main.ts makes, persisted to
    // <userDataDir>/store-node-secrets.json.
    const secrets = loadOrCreateStoreNodeSecrets(userDataDir);
    const key = deriveStoreNodeDbKey({
      backendDir,
      masterKey: secrets.LOCAL_DB_MASTER_KEY,
    });

    // Simulate offline: SYNC_CLOUD_URL stripped regardless of what the dev
    // shell happens to have set.
    const offlineEnv: NodeJS.ProcessEnv = { ...process.env };
    delete offlineEnv.SYNC_CLOUD_URL;

    // ── Round 1: first run ──────────────────────────────────────────────

    console.log(
      "\n=== ROUND 1: first launch (fresh DB, no cloud configured) ===",
    );

    const push1 = await ensureStoreNodeReady({
      dbPath,
      key,
      backendDir,
      electronPath: electronPath as unknown as string,
      oneShotScriptPath: path.join(
        desktopDir,
        "scripts",
        "push-sqlite-schema-oneshot.cjs",
      ),
      electronNativeOverride,
      // SN-5 Task 3: mirrors main.ts's real call — required so the one-shot's
      // module chain (config schema validation + the DATA_BACKEND=sqlite
      // eager Prisma singleton) has LOCAL_DB_MASTER_KEY + the JWT/sync/
      // license/PIN secrets, matching production now that this harness no
      // longer relies on rx-pos-backend's own dev `.env` to mask the gap.
      secrets,
      onLog: (line) => console.log(line),
    });
    expect(push1.firstRun).toBe(true);

    console.log(
      "[round1] ensureStoreNodeReady -> firstRun:true (schema pushed)",
    );

    handle = await startStoreNode({
      backendEntry: path.join(backendDir, "dist", "server.js"),
      backendCwd: backendDir,
      userDataDir,
      electronPath: electronPath as unknown as string,
      electronNativeOverride,
      env: offlineEnv,
      onLog: (line) => console.log(line),
    });
    const baseUrl1 = `http://127.0.0.1:${handle.port}`;

    console.log(`[round1] startStoreNode -> healthy on ${baseUrl1}`);

    const health1 = await fetch(`${baseUrl1}/api/health`);
    expect(health1.ok).toBe(true);

    const status1 = await api<{ setupRequired: boolean }>(
      baseUrl1,
      "GET",
      "/api/v1/setup/status",
    );
    expect(status1.status).toBe(200);
    expect(status1.json.data.setupRequired).toBe(true);

    console.log(
      "[round1] GET /setup/status -> setupRequired:true (needs setup)",
    );

    const adminEmail = "owner@offline-acceptance.test";
    const adminPassword = "OfflineAccept8ance!";
    const setupComplete = await api<{
      accessToken: string;
      user: { id: string; role: string };
      tenant: { id: string };
    }>(baseUrl1, "POST", "/api/v1/setup/complete", {
      body: {
        businessName: "SN-4 Offline Acceptance Pharmacy",
        businessEmail: "biz@offline-acceptance.test",
        businessPhone: "5145550100",
        firstName: "Store",
        lastName: "Owner",
        email: adminEmail,
        password: adminPassword,
        accessCode: secrets.SETUP_ACCESS_CODE,
      },
    });
    expect(setupComplete.status).toBe(201);
    expect(setupComplete.json.data.user.role).toBe("ADMIN");
    const tenantId = setupComplete.json.data.tenant.id;

    console.log(
      `[round1] POST /setup/complete -> 201, tenant ${tenantId}, admin ${adminEmail} ` +
        `(SETUP_ACCESS_CODE supplied from the persisted secrets file)`,
    );

    const login1 = await loginWithRetry(baseUrl1, adminEmail, adminPassword);
    const token1 = login1.accessToken;

    console.log(
      `[round1] POST /auth/login -> 200, got access token for user ${login1.user.id}`,
    );

    // ── Money path over HTTP ────────────────────────────────────────────
    const storeRes = await api<{ id: string }>(
      baseUrl1,
      "POST",
      "/api/v1/stores",
      {
        token: token1,
        body: { name: "SN-4 Test Store", code: "SN4TEST", province: "ON" },
      },
    );
    expect(storeRes.status).toBe(201);
    const storeId = storeRes.json.data.id;

    console.log(`[round1] POST /stores -> 201, store ${storeId} (province ON)`);

    const KNOWN_UNIT_PRICE = 10.0;
    const KNOWN_QTY = 2;
    const productRes = await api<{ id: string }>(
      baseUrl1,
      "POST",
      "/api/v1/products",
      {
        token: token1,
        body: {
          name: "SN-4 Acceptance Widget",
          sku: "SN4-WIDGET-01",
          costPrice: 5.0,
          sellPrice: KNOWN_UNIT_PRICE,
          taxCategory: "STANDARD",
          taxInclusive: false,
        },
      },
    );
    expect(productRes.status).toBe(201);
    const productId = productRes.json.data.id;

    console.log(
      `[round1] POST /products -> 201, product ${productId} @ $${KNOWN_UNIT_PRICE}`,
    );

    const stockRes = await api(
      baseUrl1,
      "POST",
      "/api/v1/inventory/stock/set",
      {
        token: token1,
        body: { storeId, productId, quantity: 50 },
      },
    );
    expect(stockRes.status).toBe(200);

    console.log("[round1] POST /inventory/stock/set -> 200, stock=50");

    const shiftRes = await api<{ id: string }>(
      baseUrl1,
      "POST",
      "/api/v1/cashier-shifts/open",
      {
        token: token1,
        body: { storeId, openingCounts: { "20": 5 } }, // $100 float
      },
    );
    expect(shiftRes.status).toBe(200);
    const shiftId = shiftRes.json.data.id;

    console.log(`[round1] POST /cashier-shifts/open -> 201, shift ${shiftId}`);

    const subtotal = KNOWN_UNIT_PRICE * KNOWN_QTY; // 20.00
    const checkoutRes = await api<{
      id: string;
      invoiceNo: string;
      subtotal: string | number;
      taxTotal: string | number;
      grandTotal: string | number;
      changeAmount: string | number;
    }>(baseUrl1, "POST", "/api/v1/sales/checkout", {
      token: token1,
      body: {
        storeId,
        shiftId,
        items: [
          {
            productId,
            quantity: KNOWN_QTY,
            unitPrice: KNOWN_UNIT_PRICE,
            discount: 0,
          },
        ],
        payments: [{ method: "CASH", amount: 50.0 }],
      },
    });
    expect(checkoutRes.status).toBe(201);
    const sale = checkoutRes.json.data;
    const saleId = sale.id;
    const grandTotal = Number(sale.grandTotal);
    const actualSubtotal = Number(sale.subtotal);
    const taxTotal = Number(sale.taxTotal);

    // Correct totals: subtotal matches the known price*qty, tax was
    // actually applied (ON, STANDARD taxCategory is not zero-rated), and
    // grandTotal is internally consistent with subtotal+tax (± the $0.05
    // cash-rounding adjustment the checkout pipeline may apply — see
    // checkout.service.ts's `roundingAdjustment`). Exact-cent tax-engine
    // correctness has its own dedicated coverage in rx-pos-backend's
    // checkout.pricing.test.ts; this harness checks the invariants a
    // real cash sale must satisfy, not the tax table itself.
    expect(actualSubtotal).toBeCloseTo(subtotal, 2);
    expect(taxTotal).toBeGreaterThan(0);
    expect(grandTotal).toBeCloseTo(actualSubtotal + taxTotal, 1);
    expect(Number(sale.changeAmount)).toBeCloseTo(50.0 - grandTotal, 1);

    console.log(
      `[round1] POST /sales/checkout -> 201, sale ${saleId} (${sale.invoiceNo}) ` +
        `subtotal=${actualSubtotal} tax=${taxTotal} grandTotal=${grandTotal} ` +
        `change=${sale.changeAmount}`,
    );

    const printRes = await api(
      baseUrl1,
      "POST",
      `/api/v1/receipts/sale/${saleId}/print`,
      {
        token: token1,
        body: {},
      },
    );
    // Soft-fail OK — no printer/device profile configured in this harness;
    // just prove the endpoint is reachable and doesn't crash the server.

    console.log(
      `[round1] POST /receipts/sale/${saleId}/print -> ${printRes.status} ` +
        `(soft-fail acceptable: no printer configured) ${JSON.stringify(printRes.json)}`,
    );

    const outbox1 = await queryOutboxCounts({
      dbPath,
      keyHex: key.toString("hex"),
    });
    expect(outbox1.total).toBeGreaterThan(0);

    console.log(
      `[round1] sync_outbox: total=${outbox1.total} pending=${outbox1.pending} ` +
        `(captured locally with no cloud configured — SN-3)`,
    );

    await handle.stop();

    console.log("[round1] store-node stopped.\n");
    handle = undefined;

    // ── Round 2: relaunch, same dbPath ───────────────────────────────────

    console.log("=== ROUND 2: relaunch (same encrypted DB file) ===");

    const push2 = await ensureStoreNodeReady({
      dbPath,
      key,
      backendDir,
      electronPath: electronPath as unknown as string,
      oneShotScriptPath: path.join(
        desktopDir,
        "scripts",
        "push-sqlite-schema-oneshot.cjs",
      ),
      electronNativeOverride,
      // SN-5 Task 3: mirrors main.ts's real call — required so the one-shot's
      // module chain (config schema validation + the DATA_BACKEND=sqlite
      // eager Prisma singleton) has LOCAL_DB_MASTER_KEY + the JWT/sync/
      // license/PIN secrets, matching production now that this harness no
      // longer relies on rx-pos-backend's own dev `.env` to mask the gap.
      secrets,
      onLog: (line) => console.log(line),
    });
    expect(push2.firstRun).toBe(false);

    console.log(
      "[round2] ensureStoreNodeReady -> firstRun:false (no re-push, DB already exists)",
    );

    handle = await startStoreNode({
      backendEntry: path.join(backendDir, "dist", "server.js"),
      backendCwd: backendDir,
      userDataDir,
      electronPath: electronPath as unknown as string,
      electronNativeOverride,
      env: offlineEnv,
      onLog: (line) => console.log(line),
    });
    const baseUrl2 = `http://127.0.0.1:${handle.port}`;

    console.log(`[round2] startStoreNode -> healthy on ${baseUrl2}`);

    const login2 = await loginWithRetry(baseUrl2, adminEmail, adminPassword);
    const token2 = login2.accessToken;

    console.log(
      `[round2] POST /auth/login -> 200 (same admin creds persisted from round 1)`,
    );

    const status2 = await api<{ setupRequired: boolean }>(
      baseUrl2,
      "GET",
      "/api/v1/setup/status",
    );
    expect(status2.json.data.setupRequired).toBe(false);

    console.log(
      "[round2] GET /setup/status -> setupRequired:false (setup already done)",
    );

    const persisted = await api<{
      id: string;
      invoiceNo: string;
      grandTotal: string | number;
    }>(baseUrl2, "GET", `/api/v1/sales/${saleId}`, { token: token2 });
    expect(persisted.status).toBe(200);
    expect(persisted.json.data.id).toBe(saleId);
    expect(Number(persisted.json.data.grandTotal)).toBeCloseTo(grandTotal, 2);

    console.log(
      `[round2] GET /sales/${saleId} -> 200, PERSISTS: invoiceNo=${persisted.json.data.invoiceNo} ` +
        `grandTotal=${persisted.json.data.grandTotal} (round1 was ${grandTotal})`,
    );

    const outbox2 = await queryOutboxCounts({
      dbPath,
      keyHex: key.toString("hex"),
    });

    console.log(
      `[round2] sync_outbox after relaunch: total=${outbox2.total} pending=${outbox2.pending} ` +
        `(>= round1's ${outbox1.total} — round1's rows are still there; round2's own ` +
        `login writes (lastLoginAt update + new refresh token) add a couple more, no ` +
        `cloud drainer ran to remove any)\n`,
    );
    expect(outbox2.total).toBeGreaterThanOrEqual(outbox1.total);
    expect(outbox2.pending).toBeGreaterThanOrEqual(outbox1.pending);

    await handle.stop();
    handle = undefined;

    console.log(
      "=== ACCEPTANCE PASSED: offline onboarding -> sell -> relaunch -> data persists ===",
    );
  }, 180_000);
});
