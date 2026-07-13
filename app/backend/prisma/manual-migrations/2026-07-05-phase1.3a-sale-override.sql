-- CreateTable
CREATE TABLE "sale_overrides" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "context" VARCHAR(255) NOT NULL,
    "authorizer_user_id" TEXT NOT NULL,
    "cashier_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sale_overrides_sale_id_idx" ON "sale_overrides"("sale_id");

-- AddForeignKey
ALTER TABLE "sale_overrides" ADD CONSTRAINT "sale_overrides_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

