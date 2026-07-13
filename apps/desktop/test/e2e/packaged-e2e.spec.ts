import path from "node:path";
import os from "node:os";
import { mkdtempSync } from "node:fs";
import {
  test,
  expect,
  request as pwRequest,
  _electron as electron,
  type APIRequestContext,
  type ElectronApplication,
} from "@playwright/test";
import {
  startEscposEmulator,
  startScaleEmulator,
  ESCPOS,
  type EscposEmulator,
  type ScaleEmulator,
} from "./helpers/tcp-emulators";

// End-to-end acceptance of the SHIPPED packaged exe, driven through its real
// GUI runtime (Playwright launches RX POS.exe) and its real bundled backend:
//   1. the app boots offline and the window.rxpos bridge is alive
//   2. the renderer resolves + reaches its dynamically-ported backend
//   3. a full cash sale onboards → sells against the packaged bundle
//   4. HARDWARE: the receipt prints to an ESC/POS TCP emulator (asserting the
//      exact protocol bytes a real Epson would receive), the drawer kicks, and
//      a network scale is read — proving the wired hardware path so a real
//      device at the same host:port is a drop-in swap on install day
//   5. a §3H feature route answers from the bundle (promotions)

const exePath = path.join(
  __dirname,
  "..",
  "..",
  "dist-desktop",
  "win-unpacked",
  "RX POS.exe",
);

let app: ElectronApplication;
let win: Awaited<ReturnType<ElectronApplication["firstWindow"]>>;
let api: APIRequestContext;
let printer: EscposEmulator;
let scale: ScaleEmulator;
let apiOrigin: string;
let accessCode: string;

const ADMIN_EMAIL = "e2e-owner@rxpos.test";
const ADMIN_PASSWORD = "E2eAccept8ance!";

test.beforeAll(async () => {
  printer = await startEscposEmulator();
  scale = await startScaleEmulator({ value: 1.234, unit: "kg" });

  const userDataDir = mkdtempSync(path.join(os.tmpdir(), "rxpos-e2e-"));
  app = await electron.launch({
    executablePath: exePath,
    args: [`--user-data-dir=${userDataDir}`],
  });

  win = await app.firstWindow({ timeout: 40000 });
  win.on("pageerror", (e) => console.log("[renderer.pageerror]", e.message));

  // The bridge exposes the dynamically-bound backend origin + the setup code.
  // Poll until the store-node has booted and the bridge is populated.
  const bridge = await win.evaluate(async () => {
    const w = window as unknown as {
      rxpos?: { apiOrigin?: string | null; setup?: { accessCode?: string | null } };
    };
    for (let i = 0; i < 60; i++) {
      const origin = w.rxpos?.apiOrigin ?? null;
      if (origin) {
        try {
          const r = await fetch(origin + "/api/health");
          if (r.ok) {
            return { apiOrigin: origin, accessCode: w.rxpos?.setup?.accessCode ?? null };
          }
        } catch {
          /* backend still coming up */
        }
      }
      await new Promise((res) => setTimeout(res, 500));
    }
    return { apiOrigin: null, accessCode: null };
  });

  expect(bridge.apiOrigin, "window.rxpos.apiOrigin must be set (bridge alive)").toBeTruthy();
  expect(bridge.accessCode, "window.rxpos.setup.accessCode must be set").toBeTruthy();
  apiOrigin = bridge.apiOrigin as string;
  accessCode = bridge.accessCode as string;

  api = await pwRequest.newContext({ baseURL: apiOrigin });
});

test.afterAll(async () => {
  await api?.dispose();
  await app?.close().catch(() => {});
  await printer?.close();
  await scale?.close();
});

// Small helper: unwrap the { success, data } envelope and assert status.
async function post<T = unknown>(url: string, body: unknown, token?: string, expected = 201) {
  const r = await api.post(url, {
    data: body,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  const json = await r.json();
  expect(r.status(), `${url} -> ${JSON.stringify(json)}`).toBe(expected);
  return (json.data ?? json) as T;
}

test("bridge is alive and the renderer reaches its backend (port fix)", async () => {
  // Proven in beforeAll: apiOrigin is a dynamic 127.0.0.1:<port> and /api/health
  // answered through the renderer's own fetch. Assert the shape here.
  expect(apiOrigin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  const health = await api.get("/api/health");
  expect(health.ok()).toBe(true);
});

test("the SPA actually renders (asset paths resolve under app://)", async () => {
  // The React app must mount — proves app:// asset URLs resolve (no blank
  // screen) AND the renderer reached the backend past CORS to hydrate.
  await expect
    .poll(
      async () =>
        win.evaluate(() => document.getElementById("root")?.childElementCount ?? 0),
      { timeout: 20000 },
    )
    .toBeGreaterThan(0);
  const bodyText = await win.evaluate(() => document.body.innerText.length);
  expect(bodyText, "rendered UI must have visible text").toBeGreaterThan(0);
});

test("onboards, sells, prints to the ESC/POS emulator, kicks the drawer, reads the scale", async () => {
  // ── Onboarding (first run, offline) ──────────────────────────────────
  const status = await api.get("/api/v1/setup/status");
  expect((await status.json()).data.setupRequired).toBe(true);

  await post(
    "/api/v1/setup/complete",
    {
      businessName: "RX POS E2E Pharmacy",
      businessEmail: "biz@rxpos.test",
      businessPhone: "5145550100",
      firstName: "E2E",
      lastName: "Owner",
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      accessCode,
    },
    undefined,
    201,
  );

  // Login (retry: a same-second re-login can 409 until the refresh-jti ticket lands).
  let token = "";
  for (let i = 0; i < 5 && !token; i++) {
    const r = await api.post("/api/v1/auth/login", {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    if (r.ok()) token = (await r.json()).data.accessToken;
    else await new Promise((res) => setTimeout(res, 1100));
  }
  expect(token, "admin login must succeed").toBeTruthy();

  const store = await post<{ id: string }>(
    "/api/v1/stores",
    { name: "E2E Store", code: "E2E1", province: "ON" },
    token,
  );
  const product = await post<{ id: string }>(
    "/api/v1/products",
    {
      name: "E2E Widget",
      sku: "E2E-WIDGET-01",
      costPrice: 5.0,
      sellPrice: 10.0,
      taxCategory: "STANDARD",
      taxInclusive: false,
    },
    token,
  );
  await post(
    "/api/v1/inventory/stock/set",
    { storeId: store.id, productId: product.id, quantity: 50 },
    token,
    200,
  );
  const shift = await post<{ id: string }>(
    "/api/v1/cashier-shifts/open",
    { storeId: store.id, openingCounts: { "20": 5 } },
    token,
    200,
  );

  // ── Register the receipt printer as a NETWORK device pointing at the
  //    ESC/POS emulator, so the sale's auto-print resolves to it. ─────────
  await post(
    "/api/v1/device-profiles",
    {
      storeId: store.id,
      kind: "printer",
      label: "E2E Epson (emulated)",
      transport: "network",
      protocol: "network",
      connection: { kind: "network", ip: "127.0.0.1", port: printer.port },
      isActive: true,
    },
    token,
    200,
  );

  // ── Sell (cash) ──────────────────────────────────────────────────────
  const sale = await post<{
    id: string;
    invoiceNo: string;
    grandTotal: string | number;
    taxTotal: string | number;
  }>(
    "/api/v1/sales/checkout",
    {
      storeId: store.id,
      shiftId: shift.id,
      items: [{ productId: product.id, quantity: 2, unitPrice: 10.0, discount: 0 }],
      payments: [{ method: "CASH", amount: 50.0 }],
    },
    token,
  );
  expect(Number(sale.taxTotal)).toBeGreaterThan(0);
  // Invoice ID format: RXPOS-<storeCode>-<4-digit daily no>-<YYYYMMDD>. Store
  // "E2E1", first sale of the day → 0001.
  expect(sale.invoiceNo, "invoice number format").toMatch(/^RXPOS-E2E1-\d{4}-\d{8}$/);

  // ── HARDWARE 1: print the sale receipt → the ESC/POS emulator must
  //    receive a well-formed command stream (init … cut). ────────────────
  printer.clear();
  const printRes = await post<{ ok: boolean }>(
    `/api/v1/receipts/sale/${sale.id}/print`,
    {},
    token,
    200,
  );
  expect(printRes.ok).toBe(true);
  await expect
    .poll(() => printer.received().length, { timeout: 5000 })
    .toBeGreaterThan(0);
  const bytes = printer.received();
  expect(bytes.includes(ESCPOS.INIT), "receipt must start with ESC @ init").toBe(true);
  expect(bytes.includes(ESCPOS.CUT_FULL), "receipt must end with a GS V cut").toBe(true);
  // Task 6: a CASH sale's receipt print auto-kicks the drawer (kick rides the
  // same ESC/POS stream). Card/gift/loyalty sales would NOT include this.
  expect(
    bytes.includes(ESCPOS.DRAWER_KICK_PIN2),
    "a cash sale's receipt must auto-kick the drawer",
  ).toBe(true);

  // ── HARDWARE 2: cash-drawer kick → the printer emulator receives the
  //    ESC p pulse bytes. ────────────────────────────────────────────────
  printer.clear();
  await post(
    "/api/v1/hardware/drawer/open",
    { target: { ip: "127.0.0.1", port: printer.port } },
    token,
    200,
  );
  await expect
    .poll(() => printer.received().length, { timeout: 5000 })
    .toBeGreaterThan(0);
  expect(
    printer.received().includes(ESCPOS.DRAWER_KICK_PIN2),
    "drawer open must send the ESC p pin-2 kick pulse",
  ).toBe(true);

  // ── HARDWARE 3: read a live weight from the network scale emulator. ────
  const reading = await post<{ value: number; unit: string; stable: boolean }>(
    "/api/v1/hardware/scale/read",
    { target: { ip: "127.0.0.1", port: scale.port } },
    token,
    200,
  );
  expect(reading.value).toBeCloseTo(1.234, 3);
  expect(reading.unit).toBe("kg");
  expect(reading.stable).toBe(true);

  // ── §3H smoke: the promotions feature route answers from the bundle. ──
  const promos = await api.get("/api/v1/promotions", {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(promos.ok(), "GET /promotions must answer from the packaged bundle").toBe(true);

  // ── Persistence: the sale is retrievable (written to the encrypted DB). ─
  const persisted = await api.get(`/api/v1/sales/${sale.id}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(persisted.ok()).toBe(true);

  // ── Local-hardware native modules load INSIDE the packaged Electron ────
  // Enumerate devices → exercises node-hid (+ serialport) in-package.
  const devices = await api.get("/api/v1/hardware/devices", {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(devices.ok(), "GET /hardware/devices must load node-hid in-package").toBe(true);
  const dd = (await devices.json()).data;
  expect(Array.isArray(dd.serial)).toBe(true);
  expect(Array.isArray(dd.hid)).toBe(true);
  expect(Array.isArray(dd.printers), "Windows printers enumerated in-package").toBe(true);

  // The serial transport is wired: printing to a bogus COM port loads
  // serialport, fails to open, and returns a clean 502 (not a crash/500).
  const serialPrint = await api.post("/api/v1/hardware/print", {
    data: {
      connection: { kind: "serial", serialPath: "COM_DOES_NOT_EXIST", baudRate: 9600 },
      job: { lines: [{ text: "serial path check" }], cut: true },
    },
    headers: { authorization: `Bearer ${token}` },
  });
  expect(serialPrint.status(), "serial print to a bogus port should 502, not crash").toBe(502);

  // The Windows raw-spooler path is wired: printing to a bogus printer queue
  // spawns the PowerShell winspool path and returns a clean 502 (proves the
  // spooler transport runs in-package without a native module).
  const winPrint = await api.post("/api/v1/hardware/print", {
    data: {
      connection: { kind: "windows-printer", printerName: "___NO_SUCH_PRINTER___" },
      job: { lines: [{ text: "spooler path check" }], cut: true },
    },
    headers: { authorization: `Bearer ${token}` },
  });
  expect(winPrint.status(), "windows-printer to a bogus queue should 502").toBe(502);

  // ── Payments: the multi-provider registry answers from the bundle with all
  //    major acquirers registered. ────────────────────────────────────────
  const provs = await api.get("/api/v1/payment-terminal/providers", {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(provs.ok(), "GET /payment-terminal/providers must answer").toBe(true);
  const providerIds = ((await provs.json()).data.providers as Array<{ id: string }>).map(
    (p) => p.id,
  );
  for (const id of ["mock", "moneris", "globalpay", "stripe", "square"]) {
    expect(providerIds, `provider ${id} registered`).toContain(id);
  }
});
