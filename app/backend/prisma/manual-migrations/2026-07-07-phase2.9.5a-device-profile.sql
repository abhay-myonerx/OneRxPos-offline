-- Phase 2.9.5a — DeviceProfile (peripheral hardware device profiles).
-- Tenant + store scoped. Additive; safe to apply on top of the 2.4 baseline.

CREATE TABLE "device_profiles" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "transport" VARCHAR(20) NOT NULL,
    "connection" JSONB NOT NULL,
    "owner_station_id" VARCHAR(120),
    "protocol" VARCHAR(20),
    "config" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "device_profiles_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "device_profiles_tenant_id_store_id_idx" ON "device_profiles"("tenant_id", "store_id");

ALTER TABLE "device_profiles"
    ADD CONSTRAINT "device_profiles_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
