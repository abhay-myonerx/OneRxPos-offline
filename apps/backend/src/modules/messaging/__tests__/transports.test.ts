import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sgSend = vi.hoisted(() => vi.fn());
const sgSetApiKey = vi.hoisted(() => vi.fn());
vi.mock("@sendgrid/mail", () => ({
  MailService: class {
    setApiKey = sgSetApiKey;
    send = sgSend;
  },
}));

const smtpSendMail = vi.hoisted(() => vi.fn());
vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail: smtpSendMail }) },
}));

import { createSendGridTransport } from "../transports/sendgrid.transport";
import { createSmtpTransport } from "../transports/smtp.transport";
import { resolveTransport } from "../transports";
import { config } from "../../../config";

beforeEach(() => {
  sgSend.mockReset();
  sgSetApiKey.mockReset();
  smtpSendMail.mockReset();
});

const msg = {
  from: { email: "s@x.co", name: "Rx" },
  to: { email: "d@y.co", name: "Cust" },
  subject: "hi",
  html: "<b>hi</b>",
};

describe("SendGridTransport", () => {
  it("returns providerMessageId on success", async () => {
    sgSend.mockResolvedValue([{ headers: { "x-message-id": "MSG123" } }]);
    const t = createSendGridTransport("SG.key");
    const r = await t.send(msg);
    expect(sgSetApiKey).toHaveBeenCalledWith("SG.key");
    expect(r.providerMessageId).toBe("MSG123");
  });
  it("throws on provider error", async () => {
    sgSend.mockRejectedValue(new Error("401 unauthorized"));
    const t = createSendGridTransport("SG.bad");
    await expect(t.send(msg)).rejects.toThrow(/401/);
  });
});

describe("SmtpTransport", () => {
  it("returns messageId and throws on failure", async () => {
    smtpSendMail.mockResolvedValue({ messageId: "<abc@host>" });
    const t = createSmtpTransport({ host: "h", port: 587, secure: true, user: "u", pass: "p" });
    const r = await t.send(msg);
    expect(r.providerMessageId).toBe("<abc@host>");

    smtpSendMail.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(t.send(msg)).rejects.toThrow(/ECONNREFUSED/);
  });
});

describe("resolveTransport", () => {
  const base = {
    enabled: true,
    transport: "sendgrid" as const,
    fromEmail: "s@x.co",
    fromName: "Rx",
    sendgrid: { apiKeyEnc: null },
    smtp: { host: null, port: null, secure: true, user: null, passwordEnc: null },
  };

  // test-env.ts hard-disables the SendGrid env fallback; assert it's off so the
  // null-path tests below are meaningful.
  const savedKey = config.SENDGRID_API_KEY;
  const savedFrom = config.SENDGRID_FROM_EMAIL;
  beforeEach(() => {
    config.SENDGRID_API_KEY = "";
    config.SENDGRID_FROM_EMAIL = "test@example.com";
  });
  afterEach(() => {
    config.SENDGRID_API_KEY = savedKey;
    config.SENDGRID_FROM_EMAIL = savedFrom;
  });

  it("returns null when disabled and no env fallback", () => {
    expect(resolveTransport({ ...base, enabled: false } as never, "t1", 1)).toBeNull();
  });
  it("returns null when enabled but no fromEmail and no env fallback", () => {
    expect(resolveTransport({ ...base, fromEmail: null } as never, "t1", 1)).toBeNull();
  });
  it("returns null when sendgrid selected but no key and no env fallback", () => {
    expect(resolveTransport(base as never, "t1", 1)).toBeNull();
  });
  it("returns null when smtp selected but incomplete and no env fallback", () => {
    expect(resolveTransport({ ...base, transport: "smtp" } as never, "t1", 1)).toBeNull();
  });

  it("uses the SendGrid env fallback when a tenant hasn't configured email", () => {
    config.SENDGRID_API_KEY = "SG.envkey";
    config.SENDGRID_FROM_EMAIL = "pos@myonerx.ca";
    // A tenant that hasn't configured email at all (disabled, no fromEmail).
    const resolved = resolveTransport({ ...base, enabled: false, fromEmail: null } as never, "t1", 1);
    expect(resolved).not.toBeNull();
    expect(resolved!.kind).toBe("SENDGRID");
    expect(resolved!.from.email).toBe("pos@myonerx.ca");
  });
});
