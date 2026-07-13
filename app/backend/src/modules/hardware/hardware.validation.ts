import { z } from "zod";

// Legacy network destination (kept so existing callers/tests that send
// `target: { ip, port }` keep working).
export const printerTargetSchema = z.object({
  ip: z.string().min(1),
  port: z.number().int().positive(),
  timeoutMs: z.number().int().positive().optional(),
});

// Transport-aware destination: network, serial (RS-232 / USB-serial), or USB-HID.
// Mirrors the DeviceProfile connection union so a device can be tested by the
// same descriptor it's configured with.
const networkConnSchema = z.object({
  kind: z.literal("network"),
  ip: z.string().min(1),
  port: z.number().int().positive(),
  timeoutMs: z.number().int().positive().optional(),
});
const serialConnSchema = z.object({
  kind: z.literal("serial"),
  serialPath: z.string().min(1),
  baudRate: z.number().int().positive(),
  dataBits: z.union([z.literal(5), z.literal(6), z.literal(7), z.literal(8)]).optional(),
  stopBits: z.union([z.literal(1), z.literal(1.5), z.literal(2)]).optional(),
  parity: z.enum(["none", "even", "odd", "mark", "space"]).optional(),
});
const usbConnSchema = z.object({
  kind: z.literal("usb"),
  usbVendorId: z.number().int(),
  usbProductId: z.number().int(),
  path: z.string().optional(),
  reportId: z.number().int().optional(),
});
const windowsPrinterConnSchema = z.object({
  kind: z.literal("windows-printer"),
  printerName: z.string().min(1),
});
export const connectionSchema = z.discriminatedUnion("kind", [
  networkConnSchema,
  serialConnSchema,
  usbConnSchema,
  windowsPrinterConnSchema,
]);

const receiptLineSchema = z.object({
  text: z.string(),
  align: z.enum(["left", "center", "right"]).optional(),
  bold: z.boolean().optional(),
});

// A destination is either the legacy `target` (network) or a `connection`
// (any transport). Exactly one must be present.
const hasDestination = (d: { target?: unknown; connection?: unknown }): boolean =>
  Boolean(d.target) !== Boolean(d.connection);

export const printReceiptSchema = z
  .object({
    target: printerTargetSchema.optional(),
    connection: connectionSchema.optional(),
    job: z.object({
      header: z.array(receiptLineSchema).optional(),
      lines: z.array(receiptLineSchema),
      barcode: z.string().optional(),
      qr: z.string().optional(),
      cut: z.boolean().optional(),
      openDrawer: z.boolean().optional(),
    }),
  })
  .refine(hasDestination, { message: "exactly one of target or connection is required" });

export type PrintReceiptInput = z.infer<typeof printReceiptSchema>;

export const openDrawerSchema = z
  .object({
    target: printerTargetSchema.optional(),
    connection: connectionSchema.optional(),
  })
  .refine(hasDestination, { message: "exactly one of target or connection is required" });

export type OpenDrawerInput = z.infer<typeof openDrawerSchema>;

export const scaleReadSchema = z
  .object({
    target: printerTargetSchema.optional(),
    connection: connectionSchema.optional(),
  })
  .refine(hasDestination, { message: "exactly one of target or connection is required" });

export type ScaleReadInput = z.infer<typeof scaleReadSchema>;
