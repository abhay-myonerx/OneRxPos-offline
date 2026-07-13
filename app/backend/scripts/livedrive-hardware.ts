// Phase 2.9.7 live-drive — drives the real hardware HTTP endpoints against
// throwaway TCP emulators and asserts the byte-path end to end.
//
// Preconditions: the backend is running (docker dev containers up + `npm run
// dev`, default :4001). Device-profile CRUD additionally needs a REAL tenant +
// store in the DB — pass LIVEDRIVE_TENANT / LIVEDRIVE_STORE to include it.
//
// Run:
//   npx tsx -r tsconfig-paths/register scripts/livedrive-hardware.ts
//
// Exit 0 = all checks passed, 1 = a check failed, 2 = backend not reachable.

import "dotenv/config";
import net from "node:net";
import { signAccessToken } from "../src/shared/utils/jwt";

const BASE = process.env.LIVEDRIVE_BASE ?? "http://localhost:4001";
const TENANT = process.env.LIVEDRIVE_TENANT ?? "livedrive-tenant";
const STORE = process.env.LIVEDRIVE_STORE ?? "livedrive-store";

function token(): string {
  return signAccessToken({
    sub: "livedrive",
    tenantId: TENANT,
    storeId: STORE,
    storeIds: [STORE],
    role: "ADMIN",
    email: "livedrive@test.io",
    firstName: "Live",
    lastName: "Drive",
  } as never);
}

// A TCP server that captures everything one client sends (printer/drawer test).
function capturingServer(): Promise<{ port: number; received: Promise<Buffer>; close: () => void }> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let done!: (b: Buffer) => void;
    const received = new Promise<Buffer>((r) => (done = r));
    const server = net.createServer((sock) => {
      sock.on("data", (d: Buffer) => chunks.push(d));
      const finish = () => done(Buffer.concat(chunks));
      sock.on("end", finish);
      sock.on("close", finish);
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as net.AddressInfo;
      resolve({ port, received, close: () => server.close() });
    });
  });
}

// A TCP server that replies to the scale poll with a fixed NCI frame.
function scaleServer(frame: string): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve) => {
    const server = net.createServer((sock) => sock.on("data", () => sock.write(frame)));
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as net.AddressInfo;
      resolve({ port, close: () => server.close() });
    });
  });
}

interface PostResult {
  status: number;
  body: { success?: boolean; data?: unknown } | null;
}

async function post(path: string, body: unknown, tok: string): Promise<PostResult> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as PostResult["body"] };
}

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.error(`  FAIL  ${name}  ${detail}`);
  }
}

async function main(): Promise<void> {
  try {
    await fetch(BASE);
  } catch {
    console.error(
      `Backend not reachable at ${BASE}. Start Docker dev containers + \`npm run dev\` first.`,
    );
    process.exit(2);
  }

  const tok = token();
  console.log(`\nLive-drive → ${BASE}\n`);

  // ── Receipt print (network) ────────────────────────────────────────────────
  const pe = await capturingServer();
  const rPrint = await post(
    "/api/v1/hardware/print",
    {
      target: { ip: "127.0.0.1", port: pe.port },
      job: { lines: [{ text: "*** LIVE DRIVE ***", align: "center", bold: true }], cut: true },
    },
    tok,
  );
  const printBytes = Array.from(await pe.received);
  pe.close();
  check("print → 200", rPrint.status === 200, `got ${rPrint.status}`);
  check("print → ESC @ init", printBytes[0] === 0x1b && printBytes[1] === 0x40);
  check("print → GS V cut", printBytes.slice(-3).join() === [0x1d, 0x56, 0x00].join());

  // ── Cash drawer (printer kick) ─────────────────────────────────────────────
  const de = await capturingServer();
  const rDrawer = await post(
    "/api/v1/hardware/drawer/open",
    { target: { ip: "127.0.0.1", port: de.port } },
    tok,
  );
  const drawerBytes = Array.from(await de.received);
  de.close();
  check("drawer → 200", rDrawer.status === 200, `got ${rDrawer.status}`);
  check("drawer → ESC p kick", drawerBytes.slice(-5).join() === [0x1b, 0x70, 0x00, 0x19, 0xfa].join());

  // ── Weighing scale (network read) ──────────────────────────────────────────
  const se = await scaleServer("2.500kgS\r");
  const rScale = await post(
    "/api/v1/hardware/scale/read",
    { target: { ip: "127.0.0.1", port: se.port } },
    tok,
  );
  se.close();
  const reading = rScale.body?.data as { value?: number; unit?: string } | undefined;
  check("scale → 200", rScale.status === 200, `got ${rScale.status}`);
  check("scale → 2.5 kg", reading?.value === 2.5 && reading?.unit === "kg", JSON.stringify(reading));

  // ── Fail-closed: unreachable printer → 502 ─────────────────────────────────
  const rDown = await post(
    "/api/v1/hardware/print",
    { target: { ip: "127.0.0.1", port: 1, timeoutMs: 800 }, job: { lines: [] } },
    tok,
  );
  check("unreachable → 502", rDown.status === 502, `got ${rDown.status}`);

  // ── Optional: device-profile CRUD (needs a real tenant/store in the DB) ────
  if (process.env.LIVEDRIVE_TENANT) {
    const created = await post(
      "/api/v1/device-profiles",
      {
        storeId: STORE,
        kind: "printer",
        label: "Live-drive printer",
        transport: "network",
        connection: { kind: "network", ip: "127.0.0.1", port: 9100 },
      },
      tok,
    );
    check("device create → 200", created.status === 200, `got ${created.status}`);
    const id = (created.body?.data as { id?: string } | undefined)?.id;

    const list = await fetch(`${BASE}/api/v1/device-profiles`, {
      headers: { authorization: `Bearer ${tok}` },
    });
    const listBody = (await list.json().catch(() => null)) as { data?: unknown[] } | null;
    check(
      "device list contains it",
      Array.isArray(listBody?.data) &&
        listBody!.data.some((d) => (d as { id?: string }).id === id),
    );

    if (id) {
      const del = await fetch(`${BASE}/api/v1/device-profiles/${id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${tok}` },
      });
      check("device delete → 200", del.status === 200, `got ${del.status}`);
    }
  } else {
    console.log("  SKIP  device CRUD (set LIVEDRIVE_TENANT / LIVEDRIVE_STORE to include it)");
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
}

void main();
