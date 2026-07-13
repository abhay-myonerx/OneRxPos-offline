-- CreateTable
CREATE TABLE "barcode_templates" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "match_type" VARCHAR(20) NOT NULL,
    "match_value" VARCHAR(255) NOT NULL,
    "strategy" VARCHAR(20) NOT NULL,
    "config" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "barcode_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "barcode_templates_tenant_id_is_active_idx" ON "barcode_templates"("tenant_id", "is_active");

-- AddForeignKey
ALTER TABLE "barcode_templates" ADD CONSTRAINT "barcode_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
