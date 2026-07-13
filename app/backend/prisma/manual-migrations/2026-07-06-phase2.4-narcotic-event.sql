-- Phase 2.4 — Controlled substances / narcotic log.
--
-- A perpetual narcotic count with reconciliation, derived alongside the existing
-- StockMovement ledger. PII-FREE by design: `narcotic_events` references only a
-- staff witness (`witness_user_id`) and the recorder (`created_by_user_id`) — it
-- carries NO patient or prescriber columns. Tenant-scoped (has `tenant_id`),
-- added to DIRECT_TENANT_MODELS. Deliberately relationless (no FKs): the log is
-- decoupled audit data.
--   • COUNT rows are observation-only (expected vs counted → discrepancy); they
--     do NOT move stock.
--   • LOSS/THEFT/DESTRUCTION rows carry a negative `quantity_change` + reason and
--     are written alongside an `ADJUSTMENT_SUB` StockMovement inside one txn.

-- CreateTable
CREATE TABLE "narcotic_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "shift_id" TEXT,
    "event_type" VARCHAR(20) NOT NULL,
    "expected_qty" INTEGER NOT NULL,
    "counted_qty" INTEGER,
    "quantity_change" INTEGER,
    "discrepancy" INTEGER,
    "reason" TEXT,
    "witness_user_id" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "narcotic_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "narcotic_events_tenant_id_product_id_created_at_idx" ON "narcotic_events"("tenant_id", "product_id", "created_at");
