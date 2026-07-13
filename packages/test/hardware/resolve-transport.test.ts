import { describe, it, expect } from "vitest";
import {
  resolveTransport,
  NoRouteError,
  type HardwareRuntime,
} from "../../src/hardware/resolve-transport";
import type { DeviceProfile } from "../../src/hardware/hal.types";

const net: DeviceProfile = {
  id: "p",
  storeId: "s",
  kind: "printer",
  label: "network printer",
  connection: { kind: "network", ip: "10.0.0.5", port: 9100 },
  ownerStationId: null,
};

const usb = (owner: string | null): DeviceProfile => ({
  id: "u",
  storeId: "s",
  kind: "scale",
  label: "usb scale",
  connection: { kind: "usb", usbVendorId: 0x1, usbProductId: 0x2 },
  ownerStationId: owner,
});

const rt = (o: Partial<HardwareRuntime>): HardwareRuntime => ({
  platform: "electron",
  stationId: null,
  hostOnline: false,
  ...o,
});

describe("resolveTransport", () => {
  it("network device → network on any platform", () => {
    expect(resolveTransport(net, rt({ platform: "web" }))).toBe("network");
    expect(resolveTransport(net, rt({ platform: "electron" }))).toBe("network");
  });

  it("usb on the owning electron station → native", () => {
    expect(
      resolveTransport(usb("st1"), rt({ platform: "electron", stationId: "st1" })),
    ).toBe("native");
  });

  it("usb from a non-owner electron station with host online → relay", () => {
    expect(
      resolveTransport(
        usb("st1"),
        rt({ platform: "electron", stationId: "st2", hostOnline: true }),
      ),
    ).toBe("relay");
  });

  it("usb from a web client with host online → relay", () => {
    expect(
      resolveTransport(
        usb("st1"),
        rt({ platform: "web", stationId: null, hostOnline: true }),
      ),
    ).toBe("relay");
  });

  it("usb from web with no host → NoRouteError", () => {
    expect(() =>
      resolveTransport(usb("st1"), rt({ platform: "web", hostOnline: false })),
    ).toThrow(NoRouteError);
  });

  it("usb owner mismatch on electron with no host → NoRouteError", () => {
    expect(() =>
      resolveTransport(
        usb("st1"),
        rt({ platform: "electron", stationId: "st2", hostOnline: false }),
      ),
    ).toThrow(NoRouteError);
  });

  it("NoRouteError carries the device id", () => {
    try {
      resolveTransport(usb("st1"), rt({ platform: "web" }));
      throw new Error("expected NoRouteError");
    } catch (e) {
      expect(e).toBeInstanceOf(NoRouteError);
      expect((e as NoRouteError).deviceId).toBe("u");
    }
  });
});
