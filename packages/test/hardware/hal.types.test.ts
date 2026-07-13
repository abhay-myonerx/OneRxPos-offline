import { describe, it, expect } from "vitest";
import type {
  DeviceProfile,
  ReceiptJob,
  HardwareHAL,
} from "../../src/hardware/hal.types";

describe("HAL types", () => {
  it("DeviceProfile accepts a network printer with a null owner station", () => {
    const p: DeviceProfile = {
      id: "d1",
      storeId: "s1",
      kind: "printer",
      label: "Front counter",
      connection: { kind: "network", ip: "192.168.1.50", port: 9100 },
      ownerStationId: null,
    };
    expect(p.connection.kind).toBe("network");
  });

  it("DeviceProfile accepts a usb scale owned by a station", () => {
    const p: DeviceProfile = {
      id: "d2",
      storeId: "s1",
      kind: "scale",
      label: "Compounding scale",
      connection: { kind: "usb", usbVendorId: 0x0922, usbProductId: 0x8009 },
      ownerStationId: "station-1",
      protocol: "hid",
    };
    expect(p.protocol).toBe("hid");
  });

  it("ReceiptJob requires lines and accepts a barcode", () => {
    const j: ReceiptJob = {
      lines: [{ text: "Total 11.30", align: "right", bold: true }],
      barcode: "INV-4",
      cut: true,
      openDrawer: true,
    };
    expect(j.lines).toHaveLength(1);
  });

  it("a partial HardwareHAL implementation type-checks", () => {
    const impl: Pick<HardwareHAL, "listDevices"> = {
      listDevices: async () => [],
    };
    expect(impl.listDevices).toBeTypeOf("function");
  });
});
