import { describe, it, expect } from "vitest";
import { HttpTerminalAdapter, type TerminalFetch } from "../../src/payment/http-terminal";

function fakeFetch(
  json: unknown,
  ok = true,
  status = 200,
): { fetch: TerminalFetch; calls: { url: string; body: string }[] } {
  const calls: { url: string; body: string }[] = [];
  const fetch: TerminalFetch = async (url, init) => {
    calls.push({ url, body: init.body });
    return { ok, status, json: async () => json };
  };
  return { fetch, calls };
}

const approvedJson = {
  status: "APPROVED",
  cardType: "INTERAC_DEBIT",
  entryMode: "TAP",
  authCode: "AUTH1",
  referenceNumber: "REF1",
  maskedPan: "1234",
  amountApprovedCents: 100,
};

describe("HttpTerminalAdapter", () => {
  it("purchase POSTs to <base>/purchase and maps the response", async () => {
    const { fetch, calls } = fakeFetch(approvedJson);
    const t = new HttpTerminalAdapter({ baseUrl: "https://esqa.example/pos", fetchImpl: fetch });
    await t.connect("", 0);
    const r = await t.purchase(100);
    expect(calls[0].url).toBe("https://esqa.example/pos/purchase");
    expect(JSON.parse(calls[0].body)).toEqual({ amountCents: 100 });
    expect(r).toMatchObject({ status: "APPROVED", cardType: "INTERAC_DEBIT", maskedPan: "1234" });
  });

  it("throws on a non-ok HTTP response (terminal error)", async () => {
    const { fetch } = fakeFetch({}, false, 502);
    const t = new HttpTerminalAdapter({ baseUrl: "b", fetchImpl: fetch });
    await expect(t.purchase(100)).rejects.toThrow();
  });

  it("records the last transaction", async () => {
    const { fetch } = fakeFetch(approvedJson);
    const t = new HttpTerminalAdapter({ baseUrl: "b", fetchImpl: fetch });
    expect(await t.getLastTransaction()).toBeNull();
    await t.purchase(100);
    expect((await t.getLastTransaction())?.referenceNumber).toBe("REF1");
  });

  it("refund and void POST to their action paths", async () => {
    const { fetch, calls } = fakeFetch(approvedJson);
    const t = new HttpTerminalAdapter({ baseUrl: "b", fetchImpl: fetch });
    await t.refund(50, "REF1");
    await t.void("REF1");
    expect(calls[0].url).toBe("b/refund");
    expect(calls[1].url).toBe("b/void");
  });

  it("uses a custom response mapping when provided", async () => {
    const { fetch } = fakeFetch({ outcome: "OK" });
    const t = new HttpTerminalAdapter({
      baseUrl: "b",
      fetchImpl: fetch,
      mapResponse: (j) => ({
        status: (j as { outcome: string }).outcome === "OK" ? "APPROVED" : "DECLINED",
        cardType: null,
        entryMode: null,
        authCode: null,
        referenceNumber: null,
        maskedPan: null,
        amountApprovedCents: null,
      }),
    });
    expect((await t.purchase(100)).status).toBe("APPROVED");
  });
});
