// 3H.1 messaging — application layer. `enqueue()` is the single entry point for
// every consumer (receipt / statement / PO / test). It performs ONE durable
// write: a MessageLog row, QUEUED when a transport resolves from the tenant's
// settings, else SKIPPED. Config problems NEVER throw — a consumer (checkout,
// PO submit, …) must not break because email isn't set up. The background
// drainer (outbox-drainer.ts) is what actually sends QUEUED rows.

import type { MessageKind } from "../../generated/prisma/enums";
import { readEmailSettings } from "./messaging.config";
import { resolveTransport } from "./transports";

export interface TenantContext {
  id: string;
  encryptionKeyVersion: number;
  settings: unknown;
}

export interface EnqueueInput {
  tenantId: string;
  storeId?: string | null;
  kind: MessageKind;
  to: { email: string; name?: string | null };
  subject: string;
  html: string;
  text?: string;
  related?: { type: string; id: string };
  createdBy?: string | null;
}

// Minimal shape of the tenant-scoped Prisma client this module needs.
interface MessageLogDb {
  messageLog: { create(args: { data: Record<string, unknown> }): Promise<Record<string, unknown>> };
}

/**
 * Loads the settings + key version a consumer controller needs to call
 * `enqueue`. Uses the tenant-scoped client so tenant isolation holds.
 */
export async function loadTenantContext(
  db: { tenant: { findUnique(args: unknown): Promise<TenantContext | null> } },
  tenantId: string,
): Promise<TenantContext> {
  const t = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, encryptionKeyVersion: true, settings: true },
  } as never);
  return t ?? { id: tenantId, encryptionKeyVersion: 1, settings: {} };
}

/** Persists a MessageLog row. Returns it. Never throws for config reasons. */
export async function enqueue(
  db: MessageLogDb,
  tenant: TenantContext,
  input: EnqueueInput,
): Promise<Record<string, unknown>> {
  const email = readEmailSettings(tenant);
  const resolved = resolveTransport(email, tenant.id, tenant.encryptionKeyVersion);
  const status = resolved ? "QUEUED" : "SKIPPED";
  const transport = (resolved?.kind ?? email.transport.toUpperCase()) as "SENDGRID" | "SMTP";

  return db.messageLog.create({
    data: {
      tenantId: input.tenantId,
      storeId: input.storeId ?? null,
      channel: "EMAIL",
      transport,
      kind: input.kind,
      toAddress: input.to.email,
      toName: input.to.name ?? null,
      subject: input.subject,
      bodyHtml: input.html,
      bodyText: input.text ?? null,
      relatedType: input.related?.type ?? null,
      relatedId: input.related?.id ?? null,
      status,
      // Due immediately once queued; null when skipped (nothing to drain).
      nextAttemptAt: status === "QUEUED" ? new Date() : null,
      createdBy: input.createdBy ?? null,
    },
  });
}
