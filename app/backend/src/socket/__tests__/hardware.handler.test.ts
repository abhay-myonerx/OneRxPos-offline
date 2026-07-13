import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { io as Client, type Socket as ClientSocket } from "socket.io-client";
import { socketAuthMiddleware, type AuthenticatedSocket } from "../auth.middleware";
import { registerHardwareHandlers } from "../hardware.handler";
import { clearAllHosts } from "../hardware-hosts";
import { signAccessToken } from "../../shared/utils/jwt";

function token(storeId = "s1", storeIds = ["s1"]): string {
  return signAccessToken({
    sub: "u1",
    tenantId: "t1",
    storeId,
    storeIds,
    role: "ADMIN",
    email: "a@b.io",
    firstName: "A",
    lastName: "B",
  } as never);
}

let httpServer: HttpServer;
let ioServer: Server;
let port: number;
const clients: ClientSocket[] = [];

function connect(tok: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const c = Client(`http://localhost:${port}`, {
      auth: { token: tok },
      transports: ["websocket"],
      forceNew: true,
    });
    clients.push(c);
    c.on("connect", () => resolve(c));
    c.on("connect_error", reject);
  });
}

beforeAll(async () => {
  httpServer = createServer();
  ioServer = new Server(httpServer);
  ioServer.use(socketAuthMiddleware);
  ioServer.on("connection", (s) =>
    registerHardwareHandlers(ioServer, s as AuthenticatedSocket),
  );
  await new Promise<void>((r) => httpServer.listen(0, r));
  port = (httpServer.address() as AddressInfo).port;
});

afterEach(() => {
  clearAllHosts();
  while (clients.length) clients.pop()?.disconnect();
});

afterAll(async () => {
  await ioServer.close();
  httpServer.close();
});

describe("hardware relay handler", () => {
  it("relays a thin-client request to the host and returns the host's response", async () => {
    const host = await connect(token());
    host.on("hardware:execute", (data, ack: (r: unknown) => void) =>
      ack({ ok: true, echoed: data }),
    );
    await new Promise<void>((resolve) => {
      host.emit("hardware:host-register", { storeId: "s1", devices: [] });
      host.on("hardware:host-registered", () => resolve());
    });

    const thin = await connect(token());
    const res = await new Promise((resolve) => {
      thin.emit(
        "hardware:request",
        { storeId: "s1", action: "print", payload: { lines: [] } },
        resolve,
      );
    });

    expect(res).toEqual({
      ok: true,
      echoed: { action: "print", payload: { lines: [] } },
    });
  });

  it("returns { ok:false, reason:'no-host' } when no host is registered", async () => {
    const thin = await connect(token());
    const res = await new Promise((resolve) => {
      thin.emit("hardware:request", { storeId: "s1", action: "drawer" }, resolve);
    });
    expect(res).toEqual({ ok: false, reason: "no-host" });
  });

  it("rejects a request for a store the user cannot access", async () => {
    const thin = await connect(token("s1", ["s1"]));
    const res = await new Promise((resolve) => {
      thin.emit("hardware:request", { storeId: "s2", action: "weigh" }, resolve);
    });
    expect(res).toEqual({ ok: false, reason: "unauthorized" });
  });

  it("unregisters the host on disconnect (next request → no-host)", async () => {
    const host = await connect(token());
    await new Promise<void>((resolve) => {
      host.emit("hardware:host-register", { storeId: "s1", devices: [] });
      host.on("hardware:host-registered", () => resolve());
    });
    host.disconnect();
    // Give the server a tick to process the disconnect.
    await new Promise((r) => setTimeout(r, 50));

    const thin = await connect(token());
    const res = await new Promise((resolve) => {
      thin.emit("hardware:request", { storeId: "s1", action: "print" }, resolve);
    });
    expect(res).toEqual({ ok: false, reason: "no-host" });
  });
});
