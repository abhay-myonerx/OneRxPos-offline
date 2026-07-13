// Small shared HTML helpers for the messaging layer's own templates (the test
// email). Consumer templates (receipt/statement/PO) live with their modules.

/** Escapes HTML so tenant-controlled data can never inject markup into an email. */
export function esc(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderTestEmailHtml(storeName?: string | null): string {
  const who = storeName ? esc(storeName) : "your RX POS store";
  return `<!doctype html><html><body style="font-family:system-ui,Arial,sans-serif">
    <h2>RX POS — email is working ✅</h2>
    <p>This is a test message from ${who}. If you received it, your outbound
    email (SendGrid/SMTP) is configured correctly.</p>
    <p style="color:#888;font-size:12px">Sent by the RX POS messaging layer.</p>
  </body></html>`;
}
