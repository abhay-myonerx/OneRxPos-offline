// Send a sample bilingual receipt to a network ESC/POS printer (or the
// escpos-netprinter emulator). Exercises the 2.10.2 French codepage + barcode +
// cut. Run: npx tsx scripts/send-sample-receipt.ts   (PRINTER_HOST/PORT optional)
import net from "node:net";
import { renderReceipt } from "rx-pos-shared";

const HOST = process.env.PRINTER_HOST ?? "127.0.0.1";
const PORT = Number(process.env.PRINTER_PORT ?? 9100);

const bytes = renderReceipt(
  {
    header: [
      { text: "RX POS - Pharmacie", align: "center", bold: true },
      { text: "123 Rue Principale, Montréal QC", align: "center" },
    ],
    lines: [
      { text: "" },
      { text: "Amoxicilline 500mg  x2       24.00" },
      { text: "Café (crème brûlée)           3.50" },
      { text: "Réactine (allergie)           8.99" },
      { text: "-------------------------------" },
      { text: "Sous-total                   36.49", align: "right" },
      { text: "TPS/TVQ                       5.46", align: "right" },
      { text: "TOTAL                        41.95", align: "right", bold: true },
      { text: "" },
      { text: "Payé par Interac - approuvé", align: "center" },
      { text: "Merci de votre visite!", align: "center" },
    ],
    barcode: "INV-1001",
    cut: true,
  },
  { codepage: "cp858" },
);

const sock = new net.Socket();
sock.setTimeout(5000);
sock.once("timeout", () => {
  console.error(`timeout sending to ${HOST}:${PORT}`);
  process.exit(1);
});
sock.once("error", (e) => {
  console.error("send failed:", e.message);
  process.exit(1);
});
sock.connect(PORT, HOST, () => {
  sock.write(Buffer.from(bytes), () => {
    sock.end();
    console.log(`sent ${bytes.length} ESC/POS bytes to ${HOST}:${PORT}`);
  });
});
