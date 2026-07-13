import { describe, it, expect } from "vitest";
import { notificationsSchema } from "../../../shared/settings/notifications";
import { maskEmailSettings, readEmailSettings } from "../messaging.config";

describe("email settings", () => {
  it("defaults email to disabled/sendgrid", () => {
    const s = notificationsSchema.parse({});
    expect(s.email.enabled).toBe(false);
    expect(s.email.transport).toBe("sendgrid");
    expect(s.email.sendgrid.apiKeyEnc).toBeNull();
  });

  it("keeps existing notification fields (back-compat)", () => {
    const s = notificationsSchema.parse({ emailEnabled: true });
    expect(s.emailEnabled).toBe(true);
    expect(s.resend.enabled).toBe(false);
  });

  it("reads the email namespace off a tenant record", () => {
    const tenant = { settings: { notifications: { email: { enabled: true, fromEmail: "a@b.co" } } } };
    const e = readEmailSettings(tenant);
    expect(e.enabled).toBe(true);
    expect(e.fromEmail).toBe("a@b.co");
  });

  it("masks secrets — never leaks ciphertext", () => {
    const s = notificationsSchema.parse({
      email: {
        enabled: true,
        transport: "sendgrid",
        fromEmail: "a@b.co",
        sendgrid: { apiKeyEnc: "CIPHERTEXT" },
      },
    });
    const masked = maskEmailSettings(s.email);
    expect(JSON.stringify(masked)).not.toContain("CIPHERTEXT");
    expect(masked.sendgrid.configured).toBe(true);
    expect(masked.smtp.configured).toBe(false);
  });
});
