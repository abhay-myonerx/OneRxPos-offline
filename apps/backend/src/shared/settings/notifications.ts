// src/shared/settings/notifications.ts — Notifications module
// tenant settings.

import { z } from "zod";

const providerConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    // Secret refs are encrypted via `src/lib/encryption.ts`.
    apiKeyEnc: z.string().nullable().default(null),
  })
  .strict();

// ── 3H.1 outbound email config ───────────────────────────────────────────────
// The messaging layer's per-tenant email settings. Secrets (`apiKeyEnc`,
// `passwordEnc`) are ciphertext produced by `encryptForTenant` — never returned
// raw by any GET (see `maskEmailSettings` in the messaging module). `transport`
// picks the adapter: SendGrid Web API (cloud/default) or the store's own SMTP
// (local-first). Defaults keep messaging DISABLED so a fresh tenant fails closed.
export const emailSettingsSchema = z
  .object({
    enabled: z.boolean().default(false),
    transport: z.enum(["sendgrid", "smtp"]).default("sendgrid"),
    fromEmail: z.string().email().nullable().default(null),
    fromName: z.string().nullable().default(null),
    sendgrid: z
      .object({ apiKeyEnc: z.string().nullable().default(null) })
      .strict()
      .default({ apiKeyEnc: null }),
    smtp: z
      .object({
        host: z.string().nullable().default(null),
        port: z.number().int().positive().nullable().default(null),
        secure: z.boolean().default(true),
        user: z.string().nullable().default(null),
        passwordEnc: z.string().nullable().default(null),
      })
      .strict()
      .default({ host: null, port: null, secure: true, user: null, passwordEnc: null }),
  })
  .strict();

export type EmailSettings = z.infer<typeof emailSettingsSchema>;

export const notificationsSchema = z
  .object({
    emailEnabled: z.boolean().default(false),
    smsEnabled: z.boolean().default(false),
    whatsappEnabled: z.boolean().default(false),
    resend: providerConfigSchema.default({
      enabled: false,
      apiKeyEnc: null,
    }),
    twilio: providerConfigSchema.default({
      enabled: false,
      apiKeyEnc: null,
    }),
    email: emailSettingsSchema.default(emailSettingsSchema.parse({})),
  })
  .strict();

export type NotificationsSettings = z.infer<typeof notificationsSchema>;
