// Demo the auto-print pipeline against the dev DB + a running ESC/POS emulator.
// Sets pharmacy details on the receipt template, points a network printer at
// 127.0.0.1:9100, then runs the REAL printSaleReceipt service for a real sale.
// Run: npx tsx -r tsconfig-paths/register scripts/demo-auto-print.ts
import "dotenv/config";
import { prisma, createTenantClient } from "../src/config/database";
import { upsertReceiptTemplate, printSaleReceipt } from "../src/modules/receipt/receipt.service";
import { listDeviceProfiles, createDeviceProfile } from "../src/modules/hardware/device-profile.service";

async function main() {
  const sale = await prisma.sale.findFirst({
    where: { status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
  });
  if (!sale) {
    console.error("No completed sale in the dev DB — ring one up first.");
    process.exit(1);
  }
  const { tenantId, storeId, id: saleId, invoiceNo } = sale;
  console.log(`Using sale ${invoiceNo} (${saleId})  tenant=${tenantId}  store=${storeId}`);

  const db = createTenantClient(tenantId);

  // 1) Pharmacy details on the receipt template.
  await upsertReceiptTemplate(db, tenantId, {
    businessName: "RX POS Pharmacie",
    businessAddress: "123 Rue Principale, Montreal QC H2X 1Y6",
    businessPhone: "(514) 555-0199",
    thankYouMsg: "Merci de votre visite!",
  });

  // 2) A network printer for this store, pointed at the emulator.
  const devices = await listDeviceProfiles(db);
  const hasEmu = devices.some(
    (d) =>
      d.storeId === storeId &&
      d.kind === "printer" &&
      (d.connection as { ip?: string } | null)?.ip === "127.0.0.1",
  );
  if (!hasEmu) {
    await createDeviceProfile(db, tenantId, {
      storeId,
      kind: "printer",
      label: "Demo emulator",
      transport: "network",
      connection: { kind: "network", ip: "127.0.0.1", port: 9100 },
    });
    console.log("Created a network printer profile -> 127.0.0.1:9100");
  }

  // 3) Print the real sale receipt via the actual service.
  const result = await printSaleReceipt(db, tenantId, saleId);
  console.log("printSaleReceipt result:", result);
  process.exit(result.ok ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
