import { describe, it, expect } from "vitest";
import { buildReceiptJob, type ReceiptContent } from "../../src/hardware/build-receipt-job";

const content: ReceiptContent = {
  business: {
    name: "RX POS Pharmacie",
    address: "123 Rue Principale, Montreal QC",
    phone: "(514) 555-0199",
  },
  store: { name: "Main Store" },
  invoiceNo: "INV-1001",
  date: "2026-07-07",
  time: "20:15:42",
  cashierName: "Alex D",
  items: [
    { name: "Amoxicilline 500mg", quantity: 2, lineTotal: "24.00" },
    { name: "Reactine (allergie)", quantity: 1, lineTotal: "8.99" },
  ],
  totals: {
    subtotal: "32.99",
    taxTotal: "4.94",
    grandTotal: "37.93",
    paidAmount: "40.00",
    changeAmount: "2.07",
  },
  payments: [{ method: "CASH", amount: "40.00" }],
};

function text(job: ReturnType<typeof buildReceiptJob>): string {
  return [...(job.header ?? []), ...job.lines].map((l) => l.text).join("\n");
}

describe("buildReceiptJob", () => {
  it("puts the pharmacy name (bold, centered) + address + phone in the header", () => {
    const job = buildReceiptJob(content);
    const name = job.header?.find((l) => l.text === "RX POS Pharmacie");
    expect(name).toMatchObject({ align: "center", bold: true });
    expect(text(job)).toContain("123 Rue Principale, Montreal QC");
    expect(text(job)).toContain("(514) 555-0199");
  });

  it("includes the invoice number and a date + time stamp", () => {
    const t = text(buildReceiptJob(content));
    expect(t).toContain("INV-1001");
    expect(t).toMatch(/2026-07-07.*20:15:42/);
  });

  it("right-aligns item lines to the column width", () => {
    const job = buildReceiptJob(content, { cols: 32 });
    const line = job.lines.find((l) => l.text.includes("Amoxicilline"));
    expect(line?.text.length).toBe(32);
    expect(line?.text.endsWith("$24.00")).toBe(true);
  });

  it("shows subtotal, tax, a BOLD total, paid and change", () => {
    const job = buildReceiptJob(content);
    const t = text(job);
    expect(t).toContain("Subtotal");
    expect(t).toMatch(/TOTAL\s+\$37\.93/);
    expect(t).toMatch(/Change\s+\$2\.07/);
    expect(job.lines.find((l) => l.text.includes("TOTAL"))?.bold).toBe(true);
  });

  it("encodes the invoice as a barcode and requests a cut", () => {
    const job = buildReceiptJob(content);
    expect(job.barcode).toBe("INV-1001");
    expect(job.cut).toBe(true);
  });

  it("omits change when it is zero", () => {
    const job = buildReceiptJob({ ...content, totals: { ...content.totals, changeAmount: "0.00" } });
    expect(text(job)).not.toContain("Change");
  });
});
