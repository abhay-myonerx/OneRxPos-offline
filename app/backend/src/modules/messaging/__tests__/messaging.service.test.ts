import { describe, it, expect, vi } from "vitest";

vi.mock("../transports", () => ({
  resolveTransport: (e: { enabled: boolean }) =>
    e.enabled ? { transport: {}, kind: "SENDGRID" } : null,
}));

import { enqueue } from "../messaging.service";

function makeDb() {
  const created: any[] = [];
  return {
    created,
    messageLog: {
      create: vi.fn(async ({ data }: any) => {
        created.push(data);
        return { id: "row1", ...data };
      }),
    },
  } as any;
}

const enabledTenant = {
  id: "t1",
  encryptionKeyVersion: 1,
  settings: {
    notifications: {
      email: {
        enabled: true,
        transport: "sendgrid",
        fromEmail: "s@x.co",
        fromName: "Rx",
        sendgrid: { apiKeyEnc: "ENC" },
        smtp: {},
      },
    },
  },
};
const disabledTenant = { id: "t1", encryptionKeyVersion: 1, settings: {} };

describe("enqueue", () => {
  it("writes a QUEUED row when configured", async () => {
    const db = makeDb();
    const row: any = await enqueue(db, enabledTenant, {
      tenantId: "t1",
      kind: "TEST" as never,
      to: { email: "d@y.co", name: "Cust" },
      subject: "hi",
      html: "<b>hi</b>",
      related: { type: "Sale", id: "s1" },
    });
    expect(row.status).toBe("QUEUED");
    expect(row.transport).toBe("SENDGRID");
    expect(row.nextAttemptAt).toBeInstanceOf(Date);
    expect(db.created[0].toAddress).toBe("d@y.co");
    expect(db.created[0].relatedType).toBe("Sale");
  });

  it("writes a SKIPPED row when unconfigured, never throws", async () => {
    const db = makeDb();
    const row: any = await enqueue(db, disabledTenant, {
      tenantId: "t1",
      kind: "RECEIPT" as never,
      to: { email: "d@y.co" },
      subject: "r",
      html: "x",
    });
    expect(row.status).toBe("SKIPPED");
    expect(row.nextAttemptAt).toBeNull();
  });
});
