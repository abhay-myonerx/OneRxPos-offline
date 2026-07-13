// SMTP transport (local-first alternative). Wraps nodemailer so a pharmacy can
// route email through its OWN mail server and a fully-offline store-node stays
// on the store's infrastructure. Same throw-on-failure contract as SendGrid.

import nodemailer from "nodemailer";

import type { MessageTransport, OutboundMessage, TransportResult } from "../messaging.types";

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

function addr(a: { email: string; name?: string }): string {
  return a.name ? `"${a.name}" <${a.email}>` : a.email;
}

export function createSmtpTransport(cfg: SmtpConfig): MessageTransport {
  const tx = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  });
  return {
    async send(msg: OutboundMessage): Promise<TransportResult> {
      const info = await tx.sendMail({
        from: addr(msg.from),
        to: addr(msg.to),
        subject: msg.subject,
        html: msg.html,
        ...(msg.text ? { text: msg.text } : {}),
      });
      return { providerMessageId: info?.messageId };
    },
  };
}
