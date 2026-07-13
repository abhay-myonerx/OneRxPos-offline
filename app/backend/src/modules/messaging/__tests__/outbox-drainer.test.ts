import { describe, it, expect, vi } from "vitest";
import { drainMessages, computeBackoff } from "../outbox-drainer";

function makePrisma(due: any[]) {
  const updates: any[] = [];
  return {
    updates,
    messageLog: {
      findMany: vi.fn(async () => due),
      update: vi.fn(async ({ where, data }: any) => {
        updates.push({ id: where.id, ...data });
      }),
    },
  } as any;
}

const tenant = {
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
const tenantResolver = async () => tenant;

function row(over: Partial<any> = {}) {
  return {
    id: "m1",
    tenantId: "t1",
    toAddress: "d@y.co",
    toName: null,
    subject: "s",
    bodyHtml: "h",
    bodyText: null,
    attempts: 0,
    maxAttempts: 5,
    ...over,
  };
}

describe("drainMessages", () => {
  it("marks SENT on success with providerMessageId", async () => {
    const prisma = makePrisma([row()]);
    const send = vi.fn(async () => ({ providerMessageId: "PID" }));
    const res = await drainMessages(prisma, tenantResolver, {
      resolveTransportImpl: () => ({ transport: { send }, kind: "SENDGRID", from: { email: "s@x.co", name: "Rx" } }) as any,
    });
    expect(res.sent).toBe(1);
    expect(prisma.updates[0].status).toBe("SENT");
    expect(prisma.updates[0].providerMessageId).toBe("PID");
  });

  it("marks SKIPPED when a row's tenant is unconfigured", async () => {
    const prisma = makePrisma([row()]);
    const res = await drainMessages(prisma, tenantResolver, {
      resolveTransportImpl: () => null,
    });
    expect(res.skipped).toBe(1);
    expect(prisma.updates[0].status).toBe("SKIPPED");
  });

  it("increments attempts + backoff on failure, terminal FAILED at maxAttempts", async () => {
    const prisma = makePrisma([row({ id: "m2", attempts: 4, maxAttempts: 5 })]);
    const send = vi.fn(async () => {
      throw new Error("boom");
    });
    const res = await drainMessages(prisma, tenantResolver, {
      resolveTransportImpl: () => ({ transport: { send }, kind: "SENDGRID", from: { email: "s@x.co", name: "Rx" } }) as any,
    });
    expect(res.failed).toBe(1);
    expect(prisma.updates[0].status).toBe("FAILED"); // 4+1 === 5 → terminal
    expect(prisma.updates[0].nextAttemptAt).toBeNull();
    expect(prisma.updates[0].lastError).toContain("boom");
  });

  it("non-terminal failure requeues with a future nextAttemptAt", async () => {
    const prisma = makePrisma([row({ attempts: 1, maxAttempts: 5 })]);
    const send = vi.fn(async () => {
      throw new Error("temp");
    });
    await drainMessages(prisma, tenantResolver, {
      resolveTransportImpl: () => ({ transport: { send }, kind: "SENDGRID", from: { email: "s@x.co", name: "Rx" } }) as any,
    });
    expect(prisma.updates[0].status).toBe("QUEUED");
    expect(prisma.updates[0].nextAttemptAt).toBeInstanceOf(Date);
  });

  it("one poison row does not block the batch", async () => {
    const prisma = makePrisma([row({ id: "bad" }), row({ id: "good", toAddress: "b@b.co" })]);
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("x"))
      .mockResolvedValueOnce({ providerMessageId: "ok" });
    const res = await drainMessages(prisma, tenantResolver, {
      resolveTransportImpl: () => ({ transport: { send }, kind: "SENDGRID", from: { email: "s@x.co", name: "Rx" } }) as any,
    });
    expect(res.sent).toBe(1);
    expect(res.failed).toBe(1);
  });

  it("never throws when findMany fails", async () => {
    const prisma = {
      messageLog: {
        findMany: vi.fn(async () => {
          throw new Error("db down");
        }),
      },
    } as any;
    const res = await drainMessages(prisma, tenantResolver);
    expect(res).toEqual({ sent: 0, failed: 0, skipped: 0 });
  });

  it("computeBackoff grows with attempts and caps", () => {
    const base = new Date("2026-07-09T00:00:00Z");
    const a1 = computeBackoff(1, base).getTime();
    const a3 = computeBackoff(3, base).getTime();
    const a99 = computeBackoff(99, base).getTime();
    expect(a3).toBeGreaterThan(a1);
    expect(a99 - base.getTime()).toBe(30 * 60_000); // capped at 30min
  });
});
