// SendGrid Web API transport (primary). A fresh `MailService` per instance so
// per-tenant API keys never clobber a shared global (the `@sendgrid/mail`
// default export is a singleton — we deliberately do NOT use it).

import { MailService } from "@sendgrid/mail";

import type { MessageTransport, OutboundMessage, TransportResult } from "../messaging.types";

export function createSendGridTransport(apiKey: string): MessageTransport {
  const client = new MailService();
  client.setApiKey(apiKey);
  return {
    async send(msg: OutboundMessage): Promise<TransportResult> {
      const [res] = await client.send({
        to: msg.to.name ? { email: msg.to.email, name: msg.to.name } : msg.to.email,
        from: msg.from.name ? { email: msg.from.email, name: msg.from.name } : msg.from.email,
        subject: msg.subject,
        html: msg.html,
        ...(msg.text ? { text: msg.text } : {}),
      });
      const id = res?.headers?.["x-message-id"];
      return { providerMessageId: typeof id === "string" ? id : undefined };
    },
  };
}
