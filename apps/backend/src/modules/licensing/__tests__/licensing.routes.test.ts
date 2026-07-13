import { describe, it, expect } from "vitest";
import supertest from "supertest";
import app from "../../../app";

describe("POST /api/v2/license/activate", () => {
  it("rejects a malformed key with 400 before touching the DB", async () => {
    const res = await supertest(app)
      .post("/api/v2/license/activate")
      .send({ key: "not-a-key", fingerprint: "f".repeat(64) });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
  it("rejects a request missing the fingerprint with 400", async () => {
    const res = await supertest(app)
      .post("/api/v2/license/activate")
      .send({ key: "AAAAA-AAAAA-AAAAA-AAAAA" });
    expect(res.status).toBe(400);
  });
});
