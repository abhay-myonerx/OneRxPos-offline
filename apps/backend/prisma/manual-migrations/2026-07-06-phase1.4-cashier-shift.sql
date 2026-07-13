-- CreateTable
CREATE TABLE "cash_movements" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "type" VARCHAR(10) NOT NULL,
    "amount" DECIMAL(12,4) NOT NULL,
    "reason" TEXT,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_movements_tenant_id_shift_id_idx" ON "cash_movements"("tenant_id", "shift_id");

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "cashier_shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: per-denomination breakdowns for the opening float + closing count
ALTER TABLE "cashier_shifts" ADD COLUMN "opening_counts" JSONB,
ADD COLUMN "closing_counts" JSONB;
