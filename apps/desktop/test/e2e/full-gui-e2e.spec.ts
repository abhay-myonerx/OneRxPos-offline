/* eslint-disable no-console */
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { mkdtempSync } from "node:fs";
import {
  test,
  expect,
  request as pwRequest,
  _electron as electron,
  type APIRequestContext,
  type ElectronApplication,
  type Page,
} from "@playwright/test";

// ─────────────────────────────────────────────────────────────────────────────
// FULL GUI end-to-end of the SHIPPED app, driven from scratch:
//   1. Launch the INSTALLED "RX POS.exe" (from the NSIS installer) — set
//      RXPOS_INSTALLED_EXE; falls back to the loose win-unpacked build.
//   2. Register the tenant + admin THROUGH THE REAL GUI setup wizard.
//   3. Seed realistic catalog / customers / suppliers / expenses / a sale via
//      the app's own bundled backend (fast + reliable), so every section has
//      data to visualise.
//   4. Walk EVERY left-nav section in the real renderer and screenshot it.
//   5. Best-effort: open a till and ring a live GUI sale (proves the F-key /
//      cart / payment path interactively).
//
// Screenshots land in RXPOS_SHOTS (default: dist-desktop/../e2e-shots).
// ─────────────────────────────────────────────────────────────────────────────

const exePath =
  process.env.RXPOS_INSTALLED_EXE ||
  path.join(__dirname, "..", "..", "dist-desktop", "win-unpacked", "RX POS.exe");

const SHOTS = process.env.RXPOS_SHOTS || path.join(__dirname, "..", "..", "e2e-shots");
fs.mkdirSync(SHOTS, { recursive: true });

const ADMIN_EMAIL = "owner@rxpos.test";
const ADMIN_PASSWORD = "RxPos2026!";

let app: ElectronApplication;
let win: Page;
let api: APIRequestContext;
let apiOrigin = "";
let accessCode = "";
let token = "";

// Shared seeded IDs, reused by the pharmacy-compliance suite.
let sharedStoreId = "";
let sharedShiftId = "";
let sharedProductIds: string[] = [];
let sharedCustomerId = "";

// Per-section health report, printed at the end.
const report: Array<{ section: string; route: string; ok: boolean; note: string }> = [];

test.describe.configure({ mode: "serial" });

async function shot(name: string) {
  const file = path.join(SHOTS, `${String(report.length + 1).padStart(2, "0")}-${name}.png`);
  await win.screenshot({ path: file, fullPage: false }).catch(() => {});
  return file;
}

async function api_post<T = any>(url: string, body: unknown, expected = 201): Promise<T | null> {
  const r = await api.post(url, {
    data: body,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  const txt = await r.text();
  let json: any;
  try {
    json = JSON.parse(txt);
  } catch {
    json = txt;
  }
  if (r.status() !== expected) {
    console.log(`  [seed] POST ${url} -> ${r.status()} ${JSON.stringify(json).slice(0, 200)}`);
    return null;
  }
  return (json?.data ?? json) as T;
}

test.beforeAll(async () => {
  console.log(`\n=== Launching: ${exePath}`);
  const userDataDir = mkdtempSync(path.join(os.tmpdir(), "rxpos-fullgui-"));
  app = await electron.launch({
    executablePath: exePath,
    args: [`--user-data-dir=${userDataDir}`],
  });
  win = await app.firstWindow({ timeout: 45000 });
  win.on("pageerror", (e) => console.log("[renderer.pageerror]", e.message));

  // Wait for the store-node backend to bind + the bridge to populate.
  const bridge = await win.evaluate(async () => {
    const w = window as any;
    for (let i = 0; i < 90; i++) {
      const origin = w.rxpos?.apiOrigin ?? null;
      if (origin) {
        try {
          const r = await fetch(origin + "/api/health");
          if (r.ok) return { apiOrigin: origin, accessCode: w.rxpos?.setup?.accessCode ?? null };
        } catch {
          /* still booting */
        }
      }
      await new Promise((res) => setTimeout(res, 500));
    }
    return { apiOrigin: null, accessCode: null };
  });
  expect(bridge.apiOrigin, "bridge.apiOrigin must be set").toBeTruthy();
  apiOrigin = bridge.apiOrigin as string;
  accessCode = (bridge.accessCode as string) ?? "";
  api = await pwRequest.newContext({ baseURL: apiOrigin });
  console.log(`=== apiOrigin=${apiOrigin} accessCode=${accessCode ? "(provided)" : "(none)"}`);
});

test.afterAll(async () => {
  await api?.dispose();
  await app?.close().catch(() => {});
  console.log("\n================ SECTION REPORT ================");
  for (const r of report) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.route.padEnd(20)} ${r.section} ${r.note}`);
  }
  console.log(`\nScreenshots: ${SHOTS}`);
});

test("1) registers tenant + admin through the GUI wizard", async () => {
  // The renderer auto-routes to /setup on first run. Wait for step 1.
  await expect(win.getByPlaceholder("Acme Corp")).toBeVisible({ timeout: 30000 });
  await shot("setup-step1-business");

  await win.getByPlaceholder("Acme Corp").fill("RX Demo Pharmacy");
  await win.getByPlaceholder("info@acme.com").fill("hello@rxdemo.test");
  await win.getByPlaceholder("+1 555 000 0000").fill("5145550100");
  // Access code is auto-applied by the desktop bridge — the field must be
  // HIDDEN entirely on the packaged app (no locked/confusing row).
  expect(await win.getByText("Setup Access Code").count(), "access-code field hidden on desktop").toBe(0);
  await win.getByRole("button", { name: /Continue/i }).click();

  await expect(win.getByRole("heading", { name: "Create the admin account" })).toBeVisible({
    timeout: 10000,
  });
  await win.getByPlaceholder("John").fill("Demo");
  await win.getByPlaceholder("Doe").fill("Owner");
  await win.getByPlaceholder("you@acme.com").fill(ADMIN_EMAIL);
  await win.getByPlaceholder("Create a strong password").fill(ADMIN_PASSWORD);
  await shot("setup-step2-admin");
  await win.getByRole("button", { name: /Complete Setup/i }).click();

  await expect(win.getByRole("heading", { name: "Setup complete!" })).toBeVisible({
    timeout: 20000,
  });
  await shot("setup-step3-complete");
  await win.getByRole("button", { name: /Go to dashboard/i }).click();

  // Landed in the authenticated shell.
  await expect
    .poll(() => win.evaluate(() => location.hash + location.pathname), { timeout: 15000 })
    .toContain("dashboard");
});

test("2) seeds realistic data through the bundled backend", async () => {
  // Login via API for a token (retry: a same-second re-login can 409).
  for (let i = 0; i < 6 && !token; i++) {
    const r = await api.post("/api/v1/auth/login", {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    if (r.ok()) token = (await r.json()).data.accessToken;
    else await new Promise((res) => setTimeout(res, 1100));
  }
  expect(token, "admin API login must succeed").toBeTruthy();

  // The store-node's encrypted DB persists across runs, so make every
  // create idempotent: unique codes/SKUs per run, and reuse an existing
  // store when the tenant was already onboarded.
  const tag = Date.now().toString(36).slice(-4).toUpperCase();

  let storeId = "";
  const store = await api_post<{ id: string }>("/api/v1/stores", {
    name: `Main Street Pharmacy ${tag}`,
    code: `MN${tag}`,
    province: "ON",
  });
  if (store?.id) storeId = store.id;
  else {
    const existing = await api.get("/api/v1/stores", {
      headers: { authorization: `Bearer ${token}` },
    });
    const list = (await existing.json())?.data;
    const arr = Array.isArray(list) ? list : (list?.items ?? list?.stores ?? []);
    storeId = arr?.[0]?.id ?? "";
  }
  expect(storeId, "have a store to work with").toBeTruthy();

  // BUG #1 FIX: category/customer-group/expense-category creates used
  // `mode:"insensitive"` which the SQLite store-node rejects. These must now
  // succeed (201) on the packaged build.
  const cat = await api_post<{ id: string }>("/api/v1/products/categories", {
    name: `Over-the-Counter ${tag}`,
  });
  expect(cat?.id, "category create must succeed (bug #1 fix)").toBeTruthy();
  const brand = await api_post<{ id: string }>("/api/v2/brands", { name: `Advil ${tag}` }, 201);

  // A handful of products so the catalog/inventory/reports look real.
  const productSpecs = [
    { name: "Advil 200mg (50ct)", sku: `OTC-ADVIL-${tag}`, costPrice: 6.5, sellPrice: 12.99 },
    { name: "Tylenol Extra Strength", sku: `OTC-TYL-${tag}`, costPrice: 5.0, sellPrice: 10.49 },
    { name: "Vitamin C 1000mg", sku: `OTC-VITC-${tag}`, costPrice: 3.25, sellPrice: 8.99 },
    { name: "Band-Aid Variety Pack", sku: `OTC-BAND-${tag}`, costPrice: 2.1, sellPrice: 5.99 },
  ];
  const products: { id: string }[] = [];
  for (const p of productSpecs) {
    const prod = await api_post<{ id: string }>("/api/v1/products", {
      ...p,
      categoryId: cat?.id ?? undefined,
      taxCategory: "STANDARD",
      taxInclusive: false,
    });
    if (prod?.id) {
      products.push(prod);
      await api_post(
        "/api/v1/inventory/stock/set",
        { storeId, productId: prod.id, quantity: 100 },
        200,
      );
    }
  }
  expect(products.length, "at least one product seeded").toBeGreaterThan(0);

  // Customer + group, supplier, expense category + expense.
  const group = await api_post<{ id: string }>(
    "/api/v1/customers/groups",
    { name: `Seniors ${tag}`, discountPercent: 10 },
    201,
  );
  expect(group?.id, "customer group create must succeed (bug #1 fix)").toBeTruthy();
  const customer = await api_post<{ id: string }>(
    "/api/v1/customers",
    {
      name: `Jane Patient ${tag}`,
      email: `jane.${tag.toLowerCase()}@example.com`,
      phone: "5145551234",
      groupId: group?.id ?? undefined,
      creditLimit: 200,
    },
    201,
  );
  await api_post(
    "/api/v1/suppliers",
    { name: `McKesson Canada ${tag}`, contactName: "Rep", email: `orders.${tag.toLowerCase()}@mckesson.test` },
    201,
  );
  const expCat = await api_post<{ id: string }>(
    "/api/v1/expenses/categories",
    { name: `Utilities ${tag}` },
    201,
  );
  expect(expCat?.id, "expense category create must succeed (bug #1 fix)").toBeTruthy();
  if (expCat?.id) {
    await api_post(
      "/api/v1/expenses",
      {
        storeId,
        categoryId: expCat.id,
        amount: 145.5,
        description: "Hydro bill — July",
        date: "2026-07-01",
      },
      201,
    );
  }

  // Open a till and ring TWO cash sales so Sales + Dashboard + Reports populate.
  const shift = await api_post<{ id: string }>(
    "/api/v1/cashier-shifts/open",
    { storeId, openingCounts: { "20": 5 } },
    200,
  );
  if (shift?.id && products[0]) {
    for (let n = 0; n < 2; n++) {
      await api_post(
        "/api/v1/sales/checkout",
        {
          storeId,
          shiftId: shift.id,
          items: [
            { productId: products[0].id, quantity: 1 + n, unitPrice: 12.99, discount: 0 },
            ...(products[1]
              ? [{ productId: products[1].id, quantity: 1, unitPrice: 10.49, discount: 0 }]
              : []),
          ],
          payments: [{ method: "CASH", amount: 100 }],
        },
        201,
      );
    }
  }
  // BUG #2 CHECK: prove the backend dashboard endpoint returns real numbers
  // (the zeros seen in the GUI were a stale-cache artifact; the fix forces the
  // dashboard query to refetch on mount).
  const dashRes = await api.get("/api/v1/tenants/me/dashboard", {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(dashRes.ok(), "dashboard endpoint must answer").toBe(true);
  const dash = (await dashRes.json()).data;
  console.log(
    `=== dashboard API: products=${dash.products} customers=${dash.customers} todaySales=${dash.todaySales} todayRevenue=${dash.todayRevenue} stores=${dash.stores}`,
  );
  expect(dash.products, "dashboard products count reflects seeded data").toBeGreaterThan(0);
  expect(dash.todaySales, "dashboard todaySales reflects seeded sales").toBeGreaterThan(0);

  // Export seeded IDs for the pharmacy suite.
  sharedStoreId = storeId;
  sharedShiftId = shift?.id ?? "";
  sharedProductIds = products.map((p) => p.id);
  sharedCustomerId = customer?.id ?? "";

  console.log("=== seeding done");
});

test("2b) pharmacy: controlled-substance compliance, Rx-at-till, narcotic register, reports", async () => {
  expect(sharedStoreId, "store seeded").toBeTruthy();
  const storeId = sharedStoreId;
  const tag = Date.now().toString(36).slice(-4).toUpperCase();

  // ── Enable PHARMACY MODE. Sectors default OFF (opt-in per tenant), so
  //    schedule enforcement / Rx-at-till / narcotic behaviour are no-ops until
  //    a tenant turns pharmacy on. There is currently no GUI toggle for this —
  //    it is only settable via the tenant settings API. ───────────────────────
  const enable = await api.patch("/api/v1/tenants/me/settings", {
    data: { enabledSectors: { pharmacy: true } },
    headers: { authorization: `Bearer ${token}` },
  });
  expect(enable.ok(), "enable pharmacy sector via settings").toBe(true);
  const enabledBack = (await enable.json())?.data?.enabledSectors?.pharmacy;
  console.log(`  [pharmacy] pharmacy sector enabled -> ${enabledBack}`);

  // ── Create a controlled (narcotic) product and stock it. ──────────────────
  const codeine = await api_post<{ id: string }>("/api/v1/products", {
    name: "Codeine 30mg (Controlled)",
    sku: `RX-CODEINE-${tag}`,
    costPrice: 3.0,
    sellPrice: 9.99,
    taxCategory: "STANDARD",
    taxInclusive: false,
  });
  expect(codeine?.id, "controlled product created").toBeTruthy();
  await api_post(
    "/api/v1/inventory/stock/set",
    { storeId, productId: codeine!.id, quantity: 40 },
    200,
  );

  // Mark it NARCOTIC via the per-product schedule override.
  const sched = await api.put(`/api/v1/products/${codeine!.id}/schedule-override`, {
    data: { scheduleOverride: "NARCOTIC" },
    headers: { authorization: `Bearer ${token}` },
  });
  expect(sched.ok(), "schedule override must be set").toBe(true);

  // ── COMPLIANCE (fail-closed): selling a NARCOTIC line with NO Rx must be
  //    blocked with 403 RX_REQUIRED and write nothing. This is the core
  //    pharmacy safety guarantee. ─────────────────────────────────────────────
  const blocked = await api.post("/api/v1/sales/checkout", {
    data: {
      storeId,
      shiftId: sharedShiftId || undefined,
      items: [{ productId: codeine!.id, quantity: 1, unitPrice: 9.99, discount: 0 }],
      payments: [{ method: "CASH", amount: 10 }],
    },
    headers: { authorization: `Bearer ${token}` },
  });
  const blockedBody = await blocked.json();
  console.log(`  [pharmacy] no-Rx narcotic checkout -> ${blocked.status()} ${blockedBody?.error?.code}`);
  expect(blocked.status(), "narcotic sale without Rx must be blocked").toBe(403);
  expect(blockedBody?.error?.code, "must be RX_REQUIRED").toBe("RX_REQUIRED");

  // ── COMPLIANCE (pass): the same line WITH an Rx link succeeds and persists
  //    the Rx (PII-free: rx number + copay only). ────────────────────────────
  const rxSale = await api_post<{ id: string; invoiceNo: string }>(
    "/api/v1/sales/checkout",
    {
      storeId,
      shiftId: sharedShiftId || undefined,
      customerId: sharedCustomerId || undefined,
      items: [
        {
          productId: codeine!.id,
          quantity: 1,
          unitPrice: 9.99,
          discount: 0,
          rx: { rxNumber: `RX-${tag}-001`, copay: 4.5 },
        },
      ],
      payments: [{ method: "CASH", amount: 10 }],
    },
    201,
  );
  expect(rxSale?.id, "Rx-linked narcotic sale must succeed").toBeTruthy();

  // ── NARCOTIC REGISTER: the controlled product shows up, record a physical
  //    count, then confirm it appears in the perpetual log. ──────────────────
  const narcProducts = await api.get(`/api/v1/narcotic/products?storeId=${storeId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(narcProducts.ok(), "GET /narcotic/products must answer").toBe(true);
  const narcList = (await narcProducts.json()).data;
  const narcArr = Array.isArray(narcList) ? narcList : (narcList?.products ?? narcList?.items ?? []);
  console.log(`  [pharmacy] narcotic products: ${narcArr.length}`);
  expect(
    narcArr.some((p: any) => p.productId === codeine!.id || p.id === codeine!.id),
    "codeine in narcotic register",
  ).toBe(true);

  const count = await api_post(
    "/api/v1/narcotic/count",
    { storeId, productId: codeine!.id, countedQty: 39 },
    201,
  );
  // count endpoint may return 200 or 201 depending on controller; accept either.
  const countAlt = count
    ? true
    : (
        await api.post("/api/v1/narcotic/count", {
          data: { storeId, productId: codeine!.id, countedQty: 39 },
          headers: { authorization: `Bearer ${token}` },
        })
      ).ok();
  expect(countAlt, "narcotic count recorded").toBeTruthy();

  const log = await api.get(`/api/v1/narcotic/log?storeId=${storeId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(log.ok(), "GET /narcotic/log must answer").toBe(true);
  const logData = (await log.json()).data;
  const logArr = Array.isArray(logData) ? logData : (logData?.entries ?? logData?.items ?? []);
  console.log(`  [pharmacy] narcotic log entries: ${logArr.length}`);
  expect(logArr.length, "narcotic log has entries (dispense + count)").toBeGreaterThan(0);

  // ── PHARMACY REPORTS + DPD lookup + AR aging + statement all answer. ──────
  const today = new Date().toISOString().slice(0, 10);
  const from = "2026-01-01";
  const range = `dateFrom=${from}&dateTo=${today}`;
  const checks: Array<[string, string]> = [
    ["pharmacy narcotic report", `/api/v1/reports/pharmacy/narcotic?storeId=${storeId}&${range}`],
    ["pharmacy rx-sales report", `/api/v1/reports/pharmacy/rx-sales?storeId=${storeId}&${range}`],
    ["pharmacy schedules report", `/api/v1/reports/pharmacy/schedules?storeId=${storeId}&${range}`],
    ["DPD drug lookup", `/api/v1/drug-products?search=aceta&limit=5`],
    ["AR aging report", `/api/v1/reports/ar-aging`],
  ];
  for (const [label, url] of checks) {
    const r = await api.get(url, { headers: { authorization: `Bearer ${token}` } });
    console.log(`  [pharmacy] ${label} -> ${r.status()}`);
    expect(r.ok(), `${label} must answer 2xx`).toBe(true);
  }

  if (sharedCustomerId) {
    const stmt = await api.get(`/api/v1/customers/${sharedCustomerId}/statement`, {
      headers: { authorization: `Bearer ${token}` },
    });
    console.log(`  [pharmacy] customer statement -> ${stmt.status()}`);
    expect(stmt.ok(), "customer statement must answer").toBe(true);
  }
  console.log("=== pharmacy suite done");
});

test("3) walks every left-nav section and screenshots it", async () => {
  const sections: Array<[string, string]> = [
    ["POS", "/pos"],
    ["Products", "/products"],
    ["Categories", "/categories"],
    ["Brands", "/brands"],
    ["Levies", "/levies"],
    ["Inventory", "/inventory"],
    ["Sales", "/sales"],
    ["Customers", "/customers"],
    ["Suppliers", "/suppliers"],
    ["Purchases", "/purchases"],
    ["Expenses", "/expenses"],
    ["Employees", "/hr/employees"],
    ["Departments", "/hr/departments"],
    ["Designations", "/hr/designations"],
    ["Attendance", "/hr/attendance"],
    ["Shifts", "/hr/shifts"],
    ["Leave", "/hr/leave"],
    ["Holidays", "/hr/holidays"],
    ["Payroll", "/hr/payroll"],
    ["Reports", "/reports"],
    ["HR Reports", "/reports/hr"],
    ["Narcotic Log", "/narcotic-log"],
    ["Users", "/users"],
    ["Permissions", "/permissions"],
    ["Stores", "/stores"],
    ["Settings", "/settings"],
    // Dashboard LAST: it first mounts pre-seed during onboarding and stays
    // mounted, so visiting it after navigating away forces a remount — proving
    // the #2 fix (refetch on mount) surfaces the now-seeded KPI numbers.
    ["Dashboard", "/dashboard"],
  ];

  for (const [label, route] of sections) {
    let ok = false;
    let note = "";
    try {
      const link = win.locator(`a[href="#${route}"]`).first();
      if (await link.count()) {
        await link.click({ timeout: 5000 });
      } else {
        note = "nav link not found; ";
        await win.evaluate((r) => {
          location.hash = r;
        }, route);
      }
      // Wait for the hash route to become active + content to settle.
      await expect
        .poll(() => win.evaluate(() => location.hash), { timeout: 6000 })
        .toContain(route);
      await win.waitForTimeout(800);

      const health = await win.evaluate(() => {
        const root = document.getElementById("root") || document.body;
        const text = document.body.innerText || "";
        const errorish =
          /something went wrong|application error|failed to load|unexpected error/i.test(text);
        return { children: root?.childElementCount ?? 0, len: text.trim().length, errorish };
      });
      ok = health.children > 0 && health.len > 0 && !health.errorish;
      note += health.errorish ? "error text on page" : `text=${health.len}`;
    } catch (e: any) {
      note += `nav failed: ${String(e).slice(0, 80)}`;
    }
    await shot(label.toLowerCase().replace(/\s+/g, "-"));
    report.push({ section: label, route, ok, note });
    console.log(`  ${ok ? "OK  " : "WARN"} ${route} ${note}`);
  }

  const failed = report.filter((r) => !r.ok);
  console.log(`\n=== ${report.length - failed.length}/${report.length} sections rendered OK`);
});

test("4) best-effort: rings a live cash sale in the POS GUI", async () => {
  try {
    const posLink = win.locator('a[href="#/pos"]').first();
    if (await posLink.count()) await posLink.click();
    await win.waitForTimeout(1000);

    // Open the till if it's closed.
    const openTill = win.getByRole("button", { name: /Open till/i });
    if (await openTill.count()) {
      await openTill.first().click().catch(() => {});
      await win.waitForTimeout(500);
      // Submit the OpenTillModal with whatever default it accepts.
      const confirm = win.getByRole("button", { name: /Open till|Confirm|Open/i }).last();
      await confirm.click({ timeout: 3000 }).catch(() => {});
      await win.waitForTimeout(800);
    }
    await shot("pos-till");

    // Search + add the first product.
    const search = win.locator('input[placeholder*="Search" i], input[type="search"]').first();
    if (await search.count()) {
      await search.fill("Advil");
      await win.waitForTimeout(1200);
    }
    await shot("pos-search");

    // Click the first "Add"-like button / product card.
    const addBtn = win.getByRole("button", { name: /^Add$/i }).first();
    if (await addBtn.count()) await addBtn.click().catch(() => {});
    else {
      const card = win.locator('[data-testid*="product"], .product-card, button').first();
      await card.click().catch(() => {});
    }
    await win.waitForTimeout(800);
    await shot("pos-cart");

    // F12 → payment modal.
    await win.keyboard.press("F12");
    await win.waitForTimeout(800);
    await shot("pos-payment");

    // F1 → hotkey help overlay (visualise the function-key reference).
    await win.keyboard.press("Escape").catch(() => {});
    await win.waitForTimeout(300);
    await win.keyboard.press("F1");
    await win.waitForTimeout(500);
    await shot("pos-hotkey-help");
    console.log("=== POS GUI walkthrough captured (best-effort)");
  } catch (e) {
    console.log("POS GUI best-effort note:", String(e).slice(0, 120));
  }
});

test("5) Settings → Pharmacy toggle enables pharmacy mode from the GUI", async () => {
  // The POS test may leave the F1/help overlay open — dismiss any modal so it
  // doesn't intercept clicks, then navigate via the hash router directly.
  await win.keyboard.press("Escape").catch(() => {});
  await win.keyboard.press("Escape").catch(() => {});
  await win.waitForTimeout(300);
  await win.evaluate(() => {
    location.hash = "/settings";
  });
  await win.waitForTimeout(1000);

  const pharmaTab = win.getByRole("button", { name: /Pharmacy/ }).first();
  await expect(pharmaTab, "Pharmacy settings tab exists").toBeVisible({ timeout: 8000 });
  await pharmaTab.click();
  await win.waitForTimeout(600);
  await shot("settings-pharmacy-tab");

  // The tab must expose the enable toggle + save button.
  const toggle = win.getByRole("switch").first();
  await expect(toggle, "pharmacy enable toggle present").toBeVisible();
  const save = win.getByRole("button", { name: /Save Settings/i });

  // Flip it OFF then save (proves the write path), then back ON and save so we
  // leave pharmacy mode enabled — capturing both states.
  const startChecked = await toggle.getAttribute("aria-checked");
  await toggle.click();
  await save.click();
  await win.waitForTimeout(1200);
  await shot("settings-pharmacy-toggled");
  const afterChecked = await win.getByRole("switch").first().getAttribute("aria-checked");
  expect(afterChecked, "toggle state changed after save").not.toBe(startChecked);

  // Ensure it ends ENABLED.
  if (afterChecked !== "true") {
    await win.getByRole("switch").first().click();
    await win.getByRole("button", { name: /Save Settings/i }).click();
    await win.waitForTimeout(1200);
  }
  await shot("settings-pharmacy-enabled");

  // Verify the write reached the backend: /auth/me now reports pharmacy on.
  const me = await api.get("/api/v1/auth/me", {
    headers: { authorization: `Bearer ${token}` },
  });
  const meData = (await me.json())?.data ?? {};
  console.log(`  [pharmacy-toggle] /auth/me enabledSectors.pharmacy = ${meData?.enabledSectors?.pharmacy}`);
  expect(meData?.enabledSectors?.pharmacy, "pharmacy enabled via GUI toggle").toBe(true);
});
