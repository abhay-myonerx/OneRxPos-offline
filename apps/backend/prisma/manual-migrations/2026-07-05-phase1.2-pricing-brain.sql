-- CreateEnum
CREATE TYPE "ProvinceCode" AS ENUM ('ON', 'QC', 'BC', 'AB', 'MB', 'SK', 'NS', 'NB', 'NL', 'PE', 'NT', 'NU', 'YT');

-- CreateEnum
CREATE TYPE "TaxCategory" AS ENUM ('STANDARD', 'ZERO_RATED', 'PROVINCIAL_RELIEF', 'EXEMPT');

-- CreateEnum
CREATE TYPE "LevyMode" AS ENUM ('FLAT_PER_UNIT', 'FLAT_PER_LINE', 'PERCENT');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "tax_category" "TaxCategory" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "tax_inclusive" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "levy_total" DECIMAL(12,4) NOT NULL DEFAULT 0,
ADD COLUMN     "rounding_adjustment" DECIMAL(12,4) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "province" "ProvinceCode";

-- CreateTable
CREATE TABLE "levies" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "mode" "LevyMode" NOT NULL,
    "amount" DECIMAL(12,4) NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "levies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_levies" (
    "product_id" TEXT NOT NULL,
    "levy_id" TEXT NOT NULL,

    CONSTRAINT "product_levies_pkey" PRIMARY KEY ("product_id","levy_id")
);

-- CreateTable
CREATE TABLE "sale_tax_lines" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "component_code" VARCHAR(10) NOT NULL,
    "base" DECIMAL(12,4) NOT NULL,
    "rate_pct" DECIMAL(6,4) NOT NULL,
    "amount" DECIMAL(12,4) NOT NULL,

    CONSTRAINT "sale_tax_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "levies_tenant_id_code_key" ON "levies"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "sale_tax_lines_sale_id_idx" ON "sale_tax_lines"("sale_id");

-- AddForeignKey
ALTER TABLE "levies" ADD CONSTRAINT "levies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_levies" ADD CONSTRAINT "product_levies_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_levies" ADD CONSTRAINT "product_levies_levy_id_fkey" FOREIGN KEY ("levy_id") REFERENCES "levies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_tax_lines" ADD CONSTRAINT "sale_tax_lines_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill tax_category / tax_inclusive from legacy tax_groups.
UPDATE "products" p
SET "tax_category" = CASE WHEN tg."rate" > 0 THEN 'STANDARD'::"TaxCategory"
                         ELSE 'ZERO_RATED'::"TaxCategory" END,
    "tax_inclusive" = COALESCE(tg."is_inclusive", false)
FROM "tax_groups" tg
WHERE p."tax_group_id" = tg."id";

