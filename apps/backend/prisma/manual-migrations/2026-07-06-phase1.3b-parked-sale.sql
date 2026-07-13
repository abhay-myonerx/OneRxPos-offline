-- CreateTable
CREATE TABLE "parked_sales" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "cashier_id" TEXT NOT NULL,
    "parked_by_name" TEXT,
    "customer_id" TEXT,
    "label" VARCHAR(120),
    "snapshot" JSONB NOT NULL,
    "item_count" INTEGER NOT NULL DEFAULT 0,
    "total" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PARKED',
    "claimed_by_user_id" TEXT,
    "claimed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parked_sales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "parked_sales_tenant_id_store_id_status_idx" ON "parked_sales"("tenant_id", "store_id", "status");

-- CreateIndex
CREATE INDEX "parked_sales_tenant_id_created_at_idx" ON "parked_sales"("tenant_id", "created_at");

-- AddForeignKey
ALTER TABLE "parked_sales" ADD CONSTRAINT "parked_sales_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
