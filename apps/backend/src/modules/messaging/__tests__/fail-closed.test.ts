import { describe, it, expect, vi } from "vitest";
import { enqueue } from "../messaging.service";
import { resolveTransport } from "../transports";

// Guarantees the property every consumer depends on: calling the messaging layer
// with an unconfigured tenant NEVER throws and NEVER sends — it records a SKIPPED
// row. A consumer wired into a checkout / PO-submit path therefore can't break
// the business operation because email isn't set up.
describe("messaging fail-closed", () => {
  it("resolveTransport returns null for an unconfigured tenant", () => {
    const email: any = {
      enabled: false,
      transport: "sendgrid",
      fromEmail: null,
      fromName: null,
      sendgrid: { apiKeyEnc: null },
      smtp: { host: null, port: null, secure: true, user: null, passwordEnc: null },
    };
    expect(resolveTransport(email, "t1", 1)).toBeNull();
  });

  it("enqueue never throws and records SKIPPED when unconfigured", async () => {
    const db: any = {
      messageLog: { create: vi.fn(async ({ data }: any) => ({ id: "x", ...data })) },
    };
    const tenant = { id: "t1", encryptionKeyVersion: 1, settings: {} };
    const row: any = await enqueue(db, tenant, {
      tenantId: "t1",
      kind: "RECEIPT",
      to: { email: "d@y.co" },
      subject: "s",
      html: "h",
    });
    expect(row.status).toBe("SKIPPED");
    expect(db.messageLog.create).toHaveBeenCalledOnce();
  });
});
