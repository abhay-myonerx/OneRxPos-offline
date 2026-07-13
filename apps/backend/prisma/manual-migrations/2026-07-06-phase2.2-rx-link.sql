-- Phase 2.2 — Rx-at-till link (schedule enforcement + Rx-at-till).
--
-- PII-FREE by design: `rx_links` stores a prescription NUMBER + copay tied to a
-- sale line's DIN. It carries NO patient or prescriber columns. Tenant-scoped
-- (has `tenant_id`), added to DIRECT_TENANT_MODELS. Rows are written inside the
-- sale's own transaction; a sale delete cascades its Rx links.

-- CreateTable
CREATE TABLE "rx_links" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "sale_item_id" TEXT,
    "product_id" TEXT NOT NULL,
    "din" VARCHAR(8),
    "rx_number" VARCHAR(50) NOT NULL,
    "copay" DECIMAL(12,4),
    "consult_ack" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rx_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rx_links_tenant_id_rx_number_idx" ON "rx_links"("tenant_id", "rx_number");

-- CreateIndex
CREATE INDEX "rx_links_sale_id_idx" ON "rx_links"("sale_id");

-- AddForeignKey: a sale delete cascades its Rx links.
ALTER TABLE "rx_links" ADD CONSTRAINT "rx_links_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
