// Integration tests for the /api/v2/sync endpoints — exercises the real
// Express app (imported directly; `app.ts` never calls `app.listen`, that
// happens only in `server.ts`, so importing it here is side-effect free).

import { describe, it, expect } from "vitest";
import supertest from "supertest";

import app from "../../../app";
import { mintSyncToken } from "../sync-token";

const ctx = { tenantId: "tenant-1", storeId: "store-1", deviceId: "device-1" };

describe("POST /api/v2/sync/push", () => {
  it("accepts a valid push with a minted store-node bearer token", async () => {
    const token = mintSyncToken(ctx);
    const events = [
      { id: "evt-1", entity: "Sale", entityId: "sale-1", op: "insert", data: { total: 100 } },
      { id: "evt-2", entity: "Sale", entityId: "sale-2", op: "update", data: { total: 200 } },
    ];

    const res = await supertest(app)
      .post("/api/v2/sync/push")
      .set("Authorization", `Bearer ${token}`)
      .send({ events });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accepted).toEqual(["evt-1", "evt-2"]);
  });

  it("rejects a push with no Authorization header", async () => {
    const res = await supertest(app).post("/api/v2/sync/push").send({ events: [] });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

describe("GET /api/v2/sync/status", () => {
  it("returns ok + serverTime for an authenticated store-node", async () => {
    const token = mintSyncToken(ctx);

    const res = await supertest(app)
      .get("/api/v2/sync/status")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.ok).toBe(true);
    expect(typeof res.body.data.serverTime).toBe("string");
  });

  it("rejects status check with no Authorization header", async () => {
    const res = await supertest(app).get("/api/v2/sync/status");

    expect(res.status).toBe(401);
  });
});
