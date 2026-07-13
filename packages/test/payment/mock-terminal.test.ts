import { describe, it, expect, beforeEach } from "vitest";
import { MockTerminal } from "../../src/payment/mock-terminal";

describe("MockTerminal", () => {
  let t: MockTerminal;
  beforeEach(async () => {
    t = new MockTerminal();
    await t.connect("h", 0);
  });

  it("throws if purchase is called before connect", async () => {
    await expect(new MockTerminal().purchase(100)).rejects.toThrow();
  });

  it("$1.00 → APPROVED Interac tap, last-4 only (no full PAN)", async () => {
    const r = await t.purchase(100);
    expect(r).toMatchObject({ status: "APPROVED", cardType: "INTERAC_DEBIT", entryMode: "TAP", amountApprovedCents: 100 });
    expect(r.maskedPan).toBe("1234");
    expect(r.maskedPan?.length).toBe(4);
  });

  it("$2.00 → APPROVED Visa chip", async () => {
    expect(await t.purchase(200)).toMatchObject({ status: "APPROVED", cardType: "VISA", entryMode: "CHIP" });
  });

  it("$0.05 and $0.10 → DECLINED", async () => {
    expect((await t.purchase(5)).status).toBe("DECLINED");
    expect((await t.purchase(10)).status).toBe("DECLINED");
  });

  it("$0.25 → CANCELLED, $0.50 → TIMEOUT", async () => {
    expect((await t.purchase(25)).status).toBe("CANCELLED");
    expect((await t.purchase(50)).status).toBe("TIMEOUT");
  });

  it("$12.34 → PARTIAL approval for less than requested", async () => {
    const r = await t.purchase(1234);
    expect(r.status).toBe("PARTIAL");
    expect(r.amountApprovedCents).toBeLessThan(1234);
  });

  it("default amount → APPROVED", async () => {
    expect((await t.purchase(999)).status).toBe("APPROVED");
  });

  it("refund and void return APPROVED", async () => {
    expect((await t.refund(100, "TXN-1")).status).toBe("APPROVED");
    expect((await t.void("TXN-1")).status).toBe("APPROVED");
  });

  it("getLastTransaction returns the last result (null before any)", async () => {
    expect(await new MockTerminal().getLastTransaction()).toBeNull();
    await t.purchase(200);
    expect((await t.getLastTransaction())?.cardType).toBe("VISA");
  });

  it("simulates a network drop then reconnects", async () => {
    const fresh = new MockTerminal();
    fresh.simulateNetworkDrop(1);
    await expect(fresh.connect("h", 0)).rejects.toThrow();
    await fresh.connect("h", 0);
    expect((await fresh.purchase(100)).status).toBe("APPROVED");
  });
});
