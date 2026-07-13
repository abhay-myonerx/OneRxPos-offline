import { z } from "zod";

const kind = z.enum(["printer", "drawer", "scale", "scanner"]);
const transport = z.enum(["network", "native", "relay"]);
const protocol = z.enum(["nci", "hid", "network"]);

const connection = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("network"), ip: z.string().min(1), port: z.number().int().positive() }),
  z.object({ kind: z.literal("usb"), usbVendorId: z.number().int(), usbProductId: z.number().int() }),
  z.object({ kind: z.literal("serial"), serialPath: z.string().min(1), baudRate: z.number().int().positive() }),
  z.object({ kind: z.literal("windows-printer"), printerName: z.string().min(1) }),
]);

const config = z.record(z.string(), z.unknown());

export const createDeviceProfileSchema = z.object({
  storeId: z.string().min(1),
  kind,
  label: z.string().min(1).max(120),
  transport,
  connection,
  ownerStationId: z.string().max(120).optional(),
  protocol: protocol.optional(),
  config: config.optional(),
  isActive: z.boolean().optional(),
});

export type CreateDeviceProfileInput = z.infer<typeof createDeviceProfileSchema>;

export const updateDeviceProfileSchema = z.object({
  storeId: z.string().min(1).optional(),
  kind: kind.optional(),
  label: z.string().min(1).max(120).optional(),
  transport: transport.optional(),
  connection: connection.optional(),
  ownerStationId: z.string().max(120).nullable().optional(),
  protocol: protocol.nullable().optional(),
  config: config.nullable().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateDeviceProfileInput = z.infer<typeof updateDeviceProfileSchema>;

export const deviceProfileIdSchema = z.object({ id: z.string().min(1) });

export type DeviceProfileIdInput = z.infer<typeof deviceProfileIdSchema>;
