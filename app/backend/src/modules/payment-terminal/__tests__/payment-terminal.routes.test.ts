import { describe, it, expect } from "vitest";
import supertest from "supertest";
import app from "../../../app";
import { signAccessToken } from "../../../shared/utils/jwt";

function token(): string {
  return signAccessToken({
    sub: "u1",
    tenantId: "t1",
    storeId: "s1",
    storeIds: ["s1"],
    role: "CASHIER",
    email: "a@b.io",
    firstName: "A",
    lastName: "B",
  } as never);
}

describe("POST /api/v1/payment-terminal/purchase", () => {
  it("$1.00 → 200 APPROVED Interac, last-4 only", async () => {
    const res = await supertest(app)
      .post("/api/v1/payment-terminal/purchase")
      .set("Authorization", `Bearer ${token()}`)
      .send({ amountCents: 100 });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: "APPROVED", cardType: "INTERAC_DEBIT" });
    expect(res.body.data.maskedPan).toBe("1234");
  });

  it("$0.05 → 200 DECLINED (a declined card is a successful call)", async () => {
    const res = await supertest(app)
      .post("/api/v1/payment-terminal/purchase")
      .set("Authorization", `Bearer ${token()}`)
      .send({ amountCents: 5 });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("DECLINED");
  });

  it("401 without a token", async () => {
    const res = await supertest(app)
      .post("/api/v1/payment-terminal/purchase")
      .send({ amountCents: 100 });
    expect(res.status).toBe(401);
  });

  it("400 on a negative amount", async () => {
    const res = await supertest(app)
      .post("/api/v1/payment-terminal/purchase")
      .set("Authorization", `Bearer ${token()}`)
      .send({ amountCents: -1 });
    expect(res.status).toBe(400);
  });
});
