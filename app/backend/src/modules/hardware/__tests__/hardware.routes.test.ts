import { describe, it, expect } from "vitest";
import supertest from "supertest";
import app from "../../../app";
import { signAccessToken } from "../../../shared/utils/jwt";
import { makeEmulator } from "./printer-emulator";
import { makeScaleEmulator } from "./scale-emulator";

function token(role = "ADMIN"): string {
  return signAccessToken({
    sub: "u1",
    tenantId: "t1",
    storeId: "s1",
    storeIds: ["s1"],
    role,
    email: "a@b.io",
    firstName: "A",
    lastName: "B",
  } as never);
}

describe("POST /api/v1/hardware/print", () => {
  it("prints a job to a network printer and returns ok", async () => {
    const emu = await makeEmulator();
    const res = await supertest(app)
      .post("/api/v1/hardware/print")
      .set("Authorization", `Bearer ${token()}`)
      .send({
        target: { ip: "127.0.0.1", port: emu.port },
        job: { lines: [{ text: "Hi" }], cut: true },
      });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { ok: true } });
    expect(Array.from(await emu.received).slice(0, 2)).toEqual([0x1b, 0x40]);
    emu.close();
  });

  it("401 without a token", async () => {
    const res = await supertest(app)
      .post("/api/v1/hardware/print")
      .send({ target: { ip: "127.0.0.1", port: 9100 }, job: { lines: [] } });
    expect(res.status).toBe(401);
  });

  it("400 on an invalid body (missing target)", async () => {
    const res = await supertest(app)
      .post("/api/v1/hardware/print")
      .set("Authorization", `Bearer ${token()}`)
      .send({ job: { lines: [] } });
    expect(res.status).toBe(400);
  });

  it("502 when the printer is unreachable", async () => {
    const res = await supertest(app)
      .post("/api/v1/hardware/print")
      .set("Authorization", `Bearer ${token()}`)
      .send({
        target: { ip: "127.0.0.1", port: 1, timeoutMs: 800 },
        job: { lines: [{ text: "x" }] },
      });
    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
  });
});

describe("POST /api/v1/hardware/drawer/open", () => {
  it("pops the drawer via the printer and returns ok", async () => {
    const emu = await makeEmulator();
    const res = await supertest(app)
      .post("/api/v1/hardware/drawer/open")
      .set("Authorization", `Bearer ${token()}`)
      .send({ target: { ip: "127.0.0.1", port: emu.port } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { ok: true } });
    expect(Array.from(await emu.received).slice(-5)).toEqual([
      0x1b, 0x70, 0x00, 0x19, 0xfa,
    ]);
    emu.close();
  });

  it("401 without a token", async () => {
    const res = await supertest(app)
      .post("/api/v1/hardware/drawer/open")
      .send({ target: { ip: "127.0.0.1", port: 9100 } });
    expect(res.status).toBe(401);
  });

  it("502 when the printer is unreachable", async () => {
    const res = await supertest(app)
      .post("/api/v1/hardware/drawer/open")
      .set("Authorization", `Bearer ${token()}`)
      .send({ target: { ip: "127.0.0.1", port: 1, timeoutMs: 800 } });
    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
  });
});

describe("POST /api/v1/hardware/scale/read", () => {
  it("returns the parsed weight from a network scale", async () => {
    const emu = await makeScaleEmulator("2.500kgS\r");
    const res = await supertest(app)
      .post("/api/v1/hardware/scale/read")
      .set("Authorization", `Bearer ${token()}`)
      .send({ target: { ip: "127.0.0.1", port: emu.port } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { value: 2.5, unit: "kg", stable: true },
    });
    emu.close();
  });

  it("401 without a token", async () => {
    const res = await supertest(app)
      .post("/api/v1/hardware/scale/read")
      .send({ target: { ip: "127.0.0.1", port: 9999 } });
    expect(res.status).toBe(401);
  });

  it("502 when the scale is unreachable", async () => {
    const res = await supertest(app)
      .post("/api/v1/hardware/scale/read")
      .set("Authorization", `Bearer ${token()}`)
      .send({ target: { ip: "127.0.0.1", port: 1, timeoutMs: 800 } });
    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
  });
});
