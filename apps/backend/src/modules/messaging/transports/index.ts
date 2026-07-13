// Transport factory. Turns a tenant's `EmailSettings` (with an env-injected
// platform fallback) into a ready-to-use `MessageTransport` + the effective
// `from` address. Decrypts the SendGrid key / SMTP password here (the only place
// secrets are handled). Returns `null` when messaging is disabled AND no env
// fallback is set OR a tenant's explicit config is broken — every one of those
// drives the SKIPPED path so a consumer never breaks because email isn't set up.
//
// Precedence: per-tenant settings first; the env fallback (config.SENDGRID_*,
// e.g. a store-node's env-injected secret) applies only when the tenant hasn't
// configured a usable transport of its own.

import type { EmailSettings } from "../../../shared/settings/notifications";
import { config } from "../../../config";
import { decryptForTenant } from "../../../lib/encryption";
import { logger } from "../../../shared/utils/logger";
import type { MessageTransport } from "../messaging.types";
import { createSendGridTransport } from "./sendgrid.transport";
import { createSmtpTransport } from "./smtp.transport";

export { createSendGridTransport } from "./sendgrid.transport";
export { createSmtpTransport } from "./smtp.transport";

export interface ResolvedTransport {
  transport: MessageTransport;
  kind: "SENDGRID" | "SMTP";
  /** The effective sender address (from tenant settings or the env fallback). */
  from: { email: string; name?: string };
}

// `_keyVersion` is accepted for call-site symmetry with the tenant context but
// isn't needed here: `decryptForTenant` reads the key version from the ciphertext
// wire format itself.
export function resolveTransport(
  email: EmailSettings,
  tenantId: string,
  _keyVersion?: number,
): ResolvedTransport | null {
  const fromName = email.fromName ?? undefined;

  // 1. Per-tenant settings (explicit config wins).
  if (email.enabled && email.fromEmail) {
    try {
      if (email.transport === "sendgrid" && email.sendgrid.apiKeyEnc) {
        const apiKey = decryptForTenant(email.sendgrid.apiKeyEnc, tenantId);
        return {
          transport: createSendGridTransport(apiKey),
          kind: "SENDGRID",
          from: { email: email.fromEmail, name: fromName },
        };
      }
      const s = email.smtp;
      if (email.transport === "smtp" && s.host && s.port && s.user && s.passwordEnc) {
        const pass = decryptForTenant(s.passwordEnc, tenantId);
        return {
          transport: createSmtpTransport({
            host: s.host,
            port: s.port,
            secure: s.secure,
            user: s.user,
            pass,
          }),
          kind: "SMTP",
          from: { email: email.fromEmail, name: fromName },
        };
      }
      // Enabled but this transport's creds are incomplete — fall through to the
      // env fallback rather than silently doing nothing.
    } catch (err) {
      // Bad ciphertext / wrong key on an EXPLICIT tenant config → misconfigured;
      // do not fall through (avoid sending from the wrong identity).
      logger.warn({ err, tenantId }, "resolveTransport: bad tenant messaging config — treating as disabled");
      return null;
    }
  }

  // 2. Env-injected SendGrid fallback (platform / store-node default).
  const envKey = config.SENDGRID_API_KEY?.trim();
  const envFrom = config.SENDGRID_FROM_EMAIL?.trim();
  if (envKey && envFrom) {
    return {
      transport: createSendGridTransport(envKey),
      kind: "SENDGRID",
      from: { email: email.fromEmail || envFrom, name: fromName },
    };
  }

  return null;
}
