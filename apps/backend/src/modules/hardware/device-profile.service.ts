// DeviceProfile data access (Phase 2.9.5a). Tenant-scoped via the request's
// TenantPrismaClient (tenantId auto-injected). Mirrors barcode-template.service.

import type { TenantPrismaClient } from "../../config/database";
import type {
  CreateDeviceProfileInput,
  UpdateDeviceProfileInput,
} from "./device-profile.validation";

export interface DeviceProfileDto {
  id: string;
  storeId: string;
  kind: string;
  label: string;
  transport: string;
  connection: unknown;
  ownerStationId: string | null;
  protocol: string | null;
  config: unknown;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SELECT = {
  id: true,
  storeId: true,
  kind: true,
  label: true,
  transport: true,
  connection: true,
  ownerStationId: true,
  protocol: true,
  config: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

function toDto(r: DeviceProfileDto): DeviceProfileDto {
  return {
    id: r.id,
    storeId: r.storeId,
    kind: r.kind,
    label: r.label,
    transport: r.transport,
    connection: r.connection,
    ownerStationId: r.ownerStationId,
    protocol: r.protocol,
    config: r.config,
    isActive: r.isActive,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export async function listDeviceProfiles(db: TenantPrismaClient): Promise<DeviceProfileDto[]> {
  const rows = await db.deviceProfile.findMany({ orderBy: { createdAt: "desc" }, select: SELECT });
  return rows.map(toDto);
}

export async function createDeviceProfile(
  db: TenantPrismaClient,
  tenantId: string,
  input: CreateDeviceProfileInput,
): Promise<DeviceProfileDto> {
  const row = await db.deviceProfile.create({
    data: {
      tenantId,
      storeId: input.storeId,
      kind: input.kind,
      label: input.label,
      transport: input.transport,
      connection: input.connection as object,
      ...(input.ownerStationId !== undefined ? { ownerStationId: input.ownerStationId } : {}),
      ...(input.protocol !== undefined ? { protocol: input.protocol } : {}),
      ...(input.config !== undefined ? { config: input.config as object } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    select: SELECT,
  });
  return toDto(row);
}

export async function updateDeviceProfile(
  db: TenantPrismaClient,
  id: string,
  input: UpdateDeviceProfileInput,
): Promise<DeviceProfileDto | null> {
  const existing = await db.deviceProfile.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return null;

  const row = await db.deviceProfile.update({
    where: { id },
    data: {
      ...(input.storeId !== undefined ? { storeId: input.storeId } : {}),
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.transport !== undefined ? { transport: input.transport } : {}),
      ...(input.connection !== undefined ? { connection: input.connection as object } : {}),
      ...(input.ownerStationId !== undefined ? { ownerStationId: input.ownerStationId } : {}),
      ...(input.protocol !== undefined ? { protocol: input.protocol } : {}),
      ...(input.config !== undefined ? { config: input.config as object } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    select: SELECT,
  });
  return toDto(row);
}

export async function deleteDeviceProfile(db: TenantPrismaClient, id: string): Promise<void> {
  await db.deviceProfile.deleteMany({ where: { id } });
}
