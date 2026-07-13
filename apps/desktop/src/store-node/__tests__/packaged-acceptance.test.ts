// SN-5 Task 4 (final): the PACKAGED offline acceptance test.
//
// offline-acceptance.test.ts (SN-4) proves the money-path against the DEV
// tree (sibling rx-pos-backend checkout). This harness proves the SAME
// money-path against the actual SHIPPED artifacts: `dist-desktop/win-
// unpacked/resources/{backend,native,scripts}` produced by
// `npm run build:desktop` (or `build:desktop:dir`) — the flattened, portable
// backend copy (prepare-backend-resources.mjs), the desktop-owned Electron
// ABI-146 `better-sqlite3-multiple-ciphers` prebuild, and the pre-generated
// sqlite DDL (SN-5 Task 2, no `npx prisma` at runtime).
//
// It drives the DESKTOP'S OWN `resolveStoreNodeResourcePaths` (main.ts's
// exact packaged-path resolution — see resource-paths.ts) with
// `isPackaged: true` and `resourcesPath` pointed at the built
// `win-unpacked/resources` directory, then the same `ensureStoreNodeReady` +
// `startStoreNode` launcher functions the real app calls, against a FRESH
// temp userData dir (never touches any real installed userData) with no
// cloud configured. This is the "packaged-backend harness" acceptance level
// documented in the SN-5 Task 4 plan: it does not click through the
// installed GUI (Electron windows cannot reliably launch in this headless
// sandbox — see boot.spec.ts/packaged.spec.ts's playwright e2e for that
// attempt), but it proves the SHIPPED bundle — not dev source, not a mock —
// sells offline and persists across a relaunch.
//
// Skips itself (not fails) when the packaged resources haven't been built
// yet, so `npm test` stays green without requiring a full `build:desktop`
// first; the SN-5 Task 4 live-verify run builds first, then runs this.
import { type ChildProcess, spawn as nodeSpawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import electronPath from "electron";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startStoreNode, storeNodeDbPath, type StoreNodeHandle } from "../launcher";
import { deriveStoreNodeDbKey, ensureStoreNodeReady } from "../onboarding";
import { resolveStoreNodeResourcePaths } from "../resource-paths";
import { loadOrCreateStoreNodeSecrets } from "../store-node-config";

const desktopDir = path.resolve(__dirname, "..", "..", "..");
const resourcesPath = path.join(desktopDir, "dist-desktop", "win-unpacked", "resources");

// The desktop's OWN packaged-path resolution (main.ts uses this identically
// when app.isPackaged) — NOT hand-rolled paths, so this harness proves the
// real resolution logic, not just that *some* backend boots.
const resolved = resolveStoreNodeResourcePaths({
  isPackaged: true,
  appPath: desktopDir, // unused when isPackaged is true
  resourcesPath,
});

// SN-5 bundle+harden pass: prepare-backend-resources.mjs's bundling step
// deletes the loose dist/server.js from the packaged resources once it's
// been inlined into server.bundle.cjs (see resource-paths.ts's serverEntry
// doc comment) — so bundle.serverEntry's own bundled file, not dist/server.js,
// is the correct "was this actually built" signal here.
const backendBuilt = existsSync(resolved.backendDir) && existsSync(resolved.serverEntry);

const electronNativeOverride = {
  hookPath: resolved.hookPath,
  sqlcipherEntry: resolved.sqlcipherEntry,
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
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const json = (await res.json()) as ApiEnvelope<T>;
  return { status: res.status, json };
}

// Same RefreshToken same-second-collision harness accommodation as
// offline-acceptance.test.ts (see that file's comment) — not a product bug
// fix, just a retry so the test doesn't flake on the < 1s race window.
async function loginWithRetry(
  baseUrl: string,
  email: string,
  password: string,
): Promise<{ accessToken: string; user: { id: string; role: string }; tenant: { id: string } }> {
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
      `[packaged-acceptance] login attempt ${i + 1}/${attempts} got ${result.status} — retrying in 1.1s`,
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

// query-outbox-count-oneshot.cjs is a test-harness-only script (never
// shipped as an extraResource — see electron-builder.yml's scripts filter)
// so it's run straight from this repo's own scripts/ dir; only the native
// override it requires (hookPath + sqlcipherEntry) points at the packaged
// resources.
function queryOutboxCounts(opts: { dbPath: string; keyHex: string }): Promise<OutboxCounts> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(desktopDir, "scripts", "query-outbox-count-oneshot.cjs");
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
        reject(new Error(`queryOutboxCounts: one-shot exited ${code}\n${stderr}`));
        return;
      }
      try {
        const line = stdout.trim().split("\n").filter(Boolean).pop() ?? "{}";
        resolve(JSON.parse(line) as OutboxCounts);
      } catch (err) {
        reject(new Error(`queryOutboxCounts: failed to parse stdout "${stdout}": ${String(err)}`));
      }
    });
  });
}

describe.runIf(backendBuilt)("SN-5 Task 4: PACKAGED offline launch -> sell -> relaunch acceptance", () => {
  let userDataDir: string | undefined;
  let handle: StoreNodeHandle | undefined;

  beforeAll(() => {
    console.log(`\n[packaged-acceptance] resourcesPath = ${resourcesPath}`);
    console.log(`[packaged-acceptance] backendDir      = ${resolved.backendDir}`);
    console.log(`[packaged-acceptance] nativeDir        = ${resolved.nativeDir}`);
    console.log(`[packaged-acceptance] hookPath         = ${resolved.hookPath}`);
    console.log(`[packaged-acceptance] oneShotScript    = ${resolved.oneShotScriptPath}\n`);
  });

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

  it("onboards, sells, and persists the sale across a relaunch — against the SHIPPED packaged bundle, fully offline", async () => {
    userDataDir = mkdtempSync(path.join(tmpdir(), "rxpos-packaged-acceptance-"));
    const dbPath = storeNodeDbPath(userDataDir);

    const secrets = loadOrCreateStoreNodeSecrets(userDataDir);
    const key = deriveStoreNodeDbKey({
      backendDir: resolved.backendDir,
      masterKey: secrets.LOCAL_DB_MASTER_KEY,
    });

    const offlineEnv: NodeJS.ProcessEnv = { ...process.env };
    delete offlineEnv.SYNC_CLOUD_URL;

    // ── Round 1: first run against the packaged bundle ──────────────────
    console.log("\n=== ROUND 1 (packaged): first launch (fresh DB, no cloud configured) ===");

    const push1 = await ensureStoreNodeReady({
      dbPath,
      key,
      backendDir: resolved.backendDir,
      electronPath: electronPath as unknown as string,
      oneShotScriptPath: resolved.oneShotScriptPath,
      electronNativeOverride,
      secrets,
      onLog: (line) => console.log(line),
    });
    expect(push1.firstRun).toBe(true);
    console.log(
      "[round1] ensureStoreNodeReady -> firstRun:true (schema pushed FROM THE SHIPPED PRE-GEN DDL, no prisma CLI)",
    );

    handle = await startStoreNode({
      // SN-5 bundle+harden pass: proves the SHIPPED bundle
      // (server.bundle.cjs — see resource-paths.ts's serverEntry doc
      // comment), not the loose dist/server.js source it was built from
      // (which prepare-backend-resources.mjs's bundling step deletes from
      // the packaged resources).
      backendEntry: resolved.serverEntry,
      backendCwd: resolved.backendDir,
      userDataDir,
      electronPath: electronPath as unknown as string,
      electronNativeOverride,
      env: offlineEnv,
      onLog: (line) => console.log(line),
    });
    const baseUrl1 = `http://127.0.0.1:${handle.port}`;
    console.log(`[round1] startStoreNode -> healthy on ${baseUrl1} (packaged backend/dist/server.js)`);

    const health1 = await fetch(`${baseUrl1}/api/health`);
    expect(health1.ok).toBe(true);

    const status1 = await api<{ setupRequired: boolean }>(baseUrl1, "GET", "/api/v1/setup/status");
    expect(status1.status).toBe(200);
    expect(status1.json.data.setupRequired).toBe(true);
    console.log("[round1] GET /setup/status -> setupRequired:true");

    const adminEmail = "owner@packaged-acceptance.test";
    const adminPassword = "PackagedAccept8ance!";
    const setupComplete = await api<{
      accessToken: string;
      user: { id: string; role: string };
      tenant: { id: string };
    }>(baseUrl1, "POST", "/api/v1/setup/complete", {
      body: {
        businessName: "SN-5 Packaged Acceptance Pharmacy",
        businessEmail: "biz@packaged-acceptance.test",
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
    console.log(`[round1] POST /setup/complete -> 201, tenant ${tenantId}, admin ${adminEmail}`);

    const login1 = await loginWithRetry(baseUrl1, adminEmail, adminPassword);
    const token1 = login1.accessToken;
    console.log(`[round1] POST /auth/login -> 200, user ${login1.user.id}`);

    const storeRes = await api<{ id: string }>(baseUrl1, "POST", "/api/v1/stores", {
      token: token1,
      body: { name: "SN-5 Packaged Store", code: "SN5PKG", province: "ON" },
    });
    expect(storeRes.status).toBe(201);
    const storeId = storeRes.json.data.id;
    console.log(`[round1] POST /stores -> 201, store ${storeId}`);

    const KNOWN_UNIT_PRICE = 10.0;
    const KNOWN_QTY = 2;
    const productRes = await api<{ id: string }>(baseUrl1, "POST", "/api/v1/products", {
      token: token1,
      body: {
        name: "SN-5 Packaged Widget",
        sku: "SN5-WIDGET-01",
        costPrice: 5.0,
        sellPrice: KNOWN_UNIT_PRICE,
        taxCategory: "STANDARD",
        taxInclusive: false,
      },
    });
    expect(productRes.status).toBe(201);
    const productId = productRes.json.data.id;
    console.log(`[round1] POST /products -> 201, product ${productId} @ $${KNOWN_UNIT_PRICE}`);

    const stockRes = await api(baseUrl1, "POST", "/api/v1/inventory/stock/set", {
      token: token1,
      body: { storeId, productId, quantity: 50 },
    });
    expect(stockRes.status).toBe(200);
    console.log("[round1] POST /inventory/stock/set -> 200, stock=50");

    const shiftRes = await api<{ id: string }>(baseUrl1, "POST", "/api/v1/cashier-shifts/open", {
      token: token1,
      body: { storeId, openingCounts: { "20": 5 } },
    });
    expect(shiftRes.status).toBe(200);
    const shiftId = shiftRes.json.data.id;
    console.log(`[round1] POST /cashier-shifts/open -> 201, shift ${shiftId}`);

    const subtotal = KNOWN_UNIT_PRICE * KNOWN_QTY;
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
        items: [{ productId, quantity: KNOWN_QTY, unitPrice: KNOWN_UNIT_PRICE, discount: 0 }],
        payments: [{ method: "CASH", amount: 50.0 }],
      },
    });
    expect(checkoutRes.status).toBe(201);
    const sale = checkoutRes.json.data;
    const saleId = sale.id;
    const grandTotal = Number(sale.grandTotal);
    const actualSubtotal = Number(sale.subtotal);
    const taxTotal = Number(sale.taxTotal);

    expect(actualSubtotal).toBeCloseTo(subtotal, 2);
    expect(taxTotal).toBeGreaterThan(0);
    expect(grandTotal).toBeCloseTo(actualSubtotal + taxTotal, 1);
    expect(Number(sale.changeAmount)).toBeCloseTo(50.0 - grandTotal, 1);

    console.log(
      `[round1] POST /sales/checkout -> 201, sale ${saleId} (${sale.invoiceNo}) ` +
        `subtotal=${actualSubtotal} tax=${taxTotal} grandTotal=${grandTotal} change=${sale.changeAmount}`,
    );

    const printRes = await api(baseUrl1, "POST", `/api/v1/receipts/sale/${saleId}/print`, {
      token: token1,
      body: {},
    });
    // Soft-fail OK — no printer/device profile configured in this harness;
    // just prove the endpoint is reachable and doesn't crash the packaged
    // server (mirrors offline-acceptance.test.ts's dev-tree coverage).
    console.log(
      `[round1] POST /receipts/sale/${saleId}/print -> ${printRes.status} ` +
        `(soft-fail acceptable: no printer configured) ${JSON.stringify(printRes.json)}`,
    );

    const outbox1 = await queryOutboxCounts({ dbPath, keyHex: key.toString("hex") });
    expect(outbox1.total).toBeGreaterThan(0);
    console.log(
      `[round1] sync_outbox: total=${outbox1.total} pending=${outbox1.pending} (no cloud configured)`,
    );

    await handle.stop();
    console.log("[round1] packaged store-node stopped.\n");
    handle = undefined;

    // ── Round 2: relaunch against the SAME packaged bundle + DB ─────────
    console.log("=== ROUND 2 (packaged): relaunch (same encrypted DB file) ===");

    const push2 = await ensureStoreNodeReady({
      dbPath,
      key,
      backendDir: resolved.backendDir,
      electronPath: electronPath as unknown as string,
      oneShotScriptPath: resolved.oneShotScriptPath,
      electronNativeOverride,
      secrets,
      onLog: (line) => console.log(line),
    });
    expect(push2.firstRun).toBe(false);
    console.log("[round2] ensureStoreNodeReady -> firstRun:false (no re-push, DB already exists)");

    handle = await startStoreNode({
      // SN-5 bundle+harden pass: proves the SHIPPED bundle
      // (server.bundle.cjs — see resource-paths.ts's serverEntry doc
      // comment), not the loose dist/server.js source it was built from
      // (which prepare-backend-resources.mjs's bundling step deletes from
      // the packaged resources).
      backendEntry: resolved.serverEntry,
      backendCwd: resolved.backendDir,
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
    console.log("[round2] POST /auth/login -> 200 (same admin creds persisted from round 1)");

    const status2 = await api<{ setupRequired: boolean }>(baseUrl2, "GET", "/api/v1/setup/status");
    expect(status2.json.data.setupRequired).toBe(false);
    console.log("[round2] GET /setup/status -> setupRequired:false");

    const persisted = await api<{ id: string; invoiceNo: string; grandTotal: string | number }>(
      baseUrl2,
      "GET",
      `/api/v1/sales/${saleId}`,
      { token: token2 },
    );
    expect(persisted.status).toBe(200);
    expect(persisted.json.data.id).toBe(saleId);
    expect(Number(persisted.json.data.grandTotal)).toBeCloseTo(grandTotal, 2);

    console.log(
      `[round2] GET /sales/${saleId} -> 200, PERSISTS: invoiceNo=${persisted.json.data.invoiceNo} ` +
        `grandTotal=${persisted.json.data.grandTotal} (round1 was ${grandTotal})`,
    );

    const outbox2 = await queryOutboxCounts({ dbPath, keyHex: key.toString("hex") });
    console.log(
      `[round2] sync_outbox after relaunch: total=${outbox2.total} pending=${outbox2.pending} ` +
        `(>= round1's ${outbox1.total})\n`,
    );
    expect(outbox2.total).toBeGreaterThanOrEqual(outbox1.total);
    expect(outbox2.pending).toBeGreaterThanOrEqual(outbox1.pending);

    await handle.stop();
    handle = undefined;

    console.log(
      "=== PACKAGED ACCEPTANCE PASSED: shipped bundle -> offline onboarding -> sell -> relaunch -> data persists ===",
    );
  }, 180_000);
});

describe.skipIf(backendBuilt)("SN-5 Task 4: PACKAGED offline acceptance (skipped)", () => {
  it("skips because the packaged resources haven't been built yet (run `npm run build:desktop` or `build:desktop:dir` first)", () => {
    console.log(
      `[packaged-acceptance] SKIPPED — ${resolved.backendDir}/dist/server.js not found. ` +
        "Run `npm run build:desktop` (or `build:desktop:dir`) first.",
    );
    expect(true).toBe(true);
  });
});
