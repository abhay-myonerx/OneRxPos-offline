// 3H.1 messaging — typed reader + secret masking for the tenant email config.
//
// `readEmailSettings` pulls the `email` namespace out of the tenant's settings
// JSON (tolerant defaults via the Zod schema). `maskEmailSettings` produces a
// GET-safe view: it NEVER emits the encrypted secrets, only a boolean
// `configured` flag, so a settings API can render "SendGrid: configured" without
// ever handing the ciphertext back to a client.

import { readNotificationsSettings } from "../../shared/settings";
import type { EmailSettings } from "../../shared/settings/notifications";

interface TenantLike {
  settings: unknown;
}

export function readEmailSettings(tenant: TenantLike): EmailSettings {
  return readNotificationsSettings(tenant as never).email;
}

export interface MaskedEmailSettings {
  enabled: boolean;
  transport: "sendgrid" | "smtp";
  fromEmail: string | null;
  fromName: string | null;
  sendgrid: { configured: boolean };
  smtp: {
    host: string | null;
    port: number | null;
    secure: boolean;
    user: string | null;
    configured: boolean;
  };
}

export function maskEmailSettings(e: EmailSettings): MaskedEmailSettings {
  return {
    enabled: e.enabled,
    transport: e.transport,
    fromEmail: e.fromEmail,
    fromName: e.fromName,
    sendgrid: { configured: !!e.sendgrid.apiKeyEnc },
    smtp: {
      host: e.smtp.host,
      port: e.smtp.port,
      secure: e.smtp.secure,
      user: e.smtp.user,
      configured: !!e.smtp.passwordEnc,
    },
  };
}
