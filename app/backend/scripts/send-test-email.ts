// scripts/send-test-email.ts
// ─────────────────────────────────────────────────────────────────────────────
// Manual live SendGrid smoke test for the 3H.1 messaging layer — the acceptance
// that can't run inside vitest (the suite hard-disables SendGrid so it never
// sends real email). Uses the SAME production transport (`createSendGridTransport`)
// and the SAME env creds (`SENDGRID_API_KEY` / `SENDGRID_FROM_EMAIL`) the drainer
// uses, so a success here proves the real send path end-to-end.
//
// Usage (from rx-pos-backend/):
//   npx tsx scripts/send-test-email.ts [recipient@example.com]
// Recipient defaults to SENDGRID_FROM_EMAIL (a self-send).
// ─────────────────────────────────────────────────────────────────────────────
import { config } from "../src/config";
import { createSendGridTransport } from "../src/modules/messaging/transports/sendgrid.transport";
import { renderTestEmailHtml } from "../src/modules/messaging/messaging.render";

async function main(): Promise<void> {
  const apiKey = config.SENDGRID_API_KEY?.trim();
  const from = config.SENDGRID_FROM_EMAIL?.trim();
  if (!apiKey || !from) {
    console.error(
      "✗ SENDGRID_API_KEY and SENDGRID_FROM_EMAIL must both be set in .env to run the smoke test.",
    );
    process.exit(1);
  }
  const to = (process.argv[2] || from).trim();

  console.log(`→ Sending test email  from=${from}  to=${to}  via SendGrid Web API…`);
  const transport = createSendGridTransport(apiKey);
  try {
    const result = await transport.send({
      from: { email: from, name: "RX POS" },
      to: { email: to },
      subject: "RX POS — SendGrid smoke test",
      html: renderTestEmailHtml("RX POS (smoke test)"),
    });
    console.log(`✓ Sent. providerMessageId=${result.providerMessageId ?? "(none returned)"}`);
    console.log("  Check the recipient inbox to confirm delivery.");
  } catch (err: unknown) {
    const e = err as { message?: string; response?: { body?: unknown } };
    console.error(`✗ Send failed: ${e.message ?? String(err)}`);
    if (e.response?.body) console.error("  SendGrid response:", JSON.stringify(e.response.body));
    process.exit(1);
  }
}

void main();
