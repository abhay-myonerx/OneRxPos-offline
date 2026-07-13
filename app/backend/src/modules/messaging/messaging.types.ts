// 3H.1 messaging — the transport-agnostic message shape + adapter interface.
//
// Consumers hand the layer already-rendered content (subject/html/text); the
// transport just delivers it. Keeping the interface to a single `send` method
// makes each adapter (SendGrid, SMTP, …future) tiny and independently testable.

export interface OutboundMessage {
  from: { email: string; name?: string };
  to: { email: string; name?: string };
  subject: string;
  html: string;
  text?: string;
}

export interface TransportResult {
  /** Provider-assigned id (SendGrid x-message-id / SMTP messageId), for audit. */
  providerMessageId?: string;
}

export interface MessageTransport {
  /** Delivers the message. Resolves on success, THROWS on any failure — the
   *  drainer treats a throw as a failed attempt and schedules a retry. */
  send(msg: OutboundMessage): Promise<TransportResult>;
}
