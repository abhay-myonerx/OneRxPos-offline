import { describe, it, expect, vi } from "vitest";
import { composeSaleInvoiceNo, getNextDailySaleNumber } from "../invoiceNumber";
import { zonedDateKey, formatReceiptDate, formatReceiptTime } from "../datetime";

describe("composeSaleInvoiceNo", () => {
  it("formats RXPOS-<storeCode>-<4-padded no>-<YYYYMMDD>", () => {
    expect(composeSaleInvoiceNo("PH001", 1, "20260709")).toBe("RXPOS-PH001-0001-20260709");
    expect(composeSaleInvoiceNo("PH001", 24, "20260709")).toBe("RXPOS-PH001-0024-20260709");
  });
  it("upper-cases the store code and handles a blank code", () => {
    expect(composeSaleInvoiceNo("ph001", 5, "20260709")).toBe("RXPOS-PH001-0005-20260709");
    expect(composeSaleInvoiceNo("", 5, "20260709")).toBe("RXPOS-NA-0005-20260709");
  });
  it("does not truncate a >4-digit daily count", () => {
    expect(composeSaleInvoiceNo("PH001", 12345, "20260709")).toBe("RXPOS-PH001-12345-20260709");
  });
});

describe("zonedDateKey", () => {
  it("returns YYYYMMDD in the given timezone (crosses the day boundary correctly)", () => {
    // 02:00 UTC on Jul 9 is still Jul 8 in Toronto (UTC-4 in summer).
    const d = new Date("2026-07-09T02:00:00Z");
    expect(zonedDateKey(d, "America/Toronto")).toBe("20260708");
    expect(zonedDateKey(d, "UTC")).toBe("20260709");
  });
});

describe("receipt formatting honours the timezone", () => {
  it("formats date + time in the requested timezone", () => {
    const d = new Date("2026-07-09T02:30:00Z"); // Jul 8, 22:30 in Toronto
    expect(formatReceiptDate(d, "America/Toronto", "en-US")).toMatch(/Jul 8, 2026/);
    expect(formatReceiptTime(d, "America/Toronto", "en-US")).toMatch(/10:30:00\s?PM/);
    expect(formatReceiptDate(d, "UTC", "en-US")).toMatch(/Jul 9, 2026/);
  });
});

describe("getNextDailySaleNumber", () => {
  it("atomically upserts a store+day-scoped counter and returns the number", async () => {
    const upsert = vi.fn().mockResolvedValue({ lastNumber: 1 });
    const tx = { invoiceSequence: { upsert } } as never;
    const n = await getNextDailySaleNumber(tx, "tenant-1", "store-9", "20260709");
    expect(n).toBe(1);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_type: { tenantId: "tenant-1", type: "d:store-9:20260709" } },
      }),
    );
  });
});
