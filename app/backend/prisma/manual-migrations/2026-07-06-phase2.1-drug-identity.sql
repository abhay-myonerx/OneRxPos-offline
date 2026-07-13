-- CreateEnum
CREATE TYPE "DrugScheduleCategory" AS ENUM ('NEEDS_RX', 'NARCOTIC', 'BEHIND_COUNTER', 'OPEN');

-- CreateTable: GLOBAL Health-Canada drug reference catalog (Phase 2.1).
-- NOT tenant-scoped — reference data every tenant shares, keyed by DIN.
CREATE TABLE "drug_products" (
    "id" TEXT NOT NULL,
    "din" VARCHAR(8) NOT NULL,
    "brandName" VARCHAR(200) NOT NULL,
    "company" VARCHAR(200),
    "form" VARCHAR(100),
    "route" VARCHAR(100),
    "activeIngredients" JSONB NOT NULL,
    "schedule_class" VARCHAR(100),
    "schedule_category" "DrugScheduleCategory" NOT NULL DEFAULT 'OPEN',
    "status" VARCHAR(40),
    "npn" VARCHAR(12),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drug_products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "drug_products_din_key" ON "drug_products"("din");

-- CreateIndex
CREATE INDEX "drug_products_brandName_idx" ON "drug_products"("brandName");

-- CreateIndex
CREATE INDEX "drug_products_schedule_category_idx" ON "drug_products"("schedule_category");

-- AlterTable: give a tenant Product a drug identity (soft DIN link + override).
ALTER TABLE "products" ADD COLUMN "din" VARCHAR(8),
ADD COLUMN "schedule_override" "DrugScheduleCategory";

-- CreateIndex
CREATE INDEX "products_tenant_id_din_idx" ON "products"("tenant_id", "din");
