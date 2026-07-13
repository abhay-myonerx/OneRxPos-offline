import { describe, it, expect } from "vitest";
import { getProfile, getProfileOfKind } from "../../src/hardware/profiles";

describe("profile registry", () => {
  it("returns an Epson ESC/POS printer profile with its drawer-kick bytes", () => {
    const p = getProfile("epson_tm_t88v");
    expect(p?.kind).toBe("printer");
    expect(p).toMatchObject({ commandSet: "escpos", widthCols: 48 });
    expect((p as { drawerKickPin2: number[] }).drawerKickPin2).toEqual([0x1b, 0x70, 0x00, 0x19, 0xfa]);
  });

  it("Star uses a different command set and a different kick code than Epson", () => {
    const epson = getProfile("epson_tm_t88v") as { drawerKickPin2: number[] };
    const star = getProfile("star_tsp143") as { commandSet: string; drawerKickPin2: number[] };
    expect(star.commandSet).toBe("star");
    expect(star.drawerKickPin2).not.toEqual(epson.drawerKickPin2);
  });

  it("exposes a ZPL label profile", () => {
    expect(getProfile("zebra_zd410")).toMatchObject({ kind: "printer", commandSet: "zpl" });
  });

  it("GS1 DataMatrix scanner carries the ]d2 prefix", () => {
    expect(getProfile("2d_gs1_datamatrix")).toMatchObject({ kind: "scanner", prefix: "]d2", suffix: "\r" });
  });

  it("a Tab-suffix scanner profile exists", () => {
    expect(getProfile("datalogic_quickscan")).toMatchObject({ kind: "scanner", suffix: "\t" });
  });

  it("ValuLine drawer kicks through the Epson pinout", () => {
    expect(getProfile("valuline_via_epson")).toMatchObject({
      kind: "drawer",
      via: "printer",
      kickPin2: [0x1b, 0x70, 0x00, 0x19, 0xfa],
    });
  });

  it("NCI + Toledo scale profiles carry their poll commands", () => {
    expect(getProfile("nci_scp01")).toMatchObject({ kind: "scale", protocol: "nci", pollCmd: [0x57, 0x0d] });
    expect(getProfile("toledo_8217")).toMatchObject({ kind: "scale", protocol: "toledo", pollCmd: [0x05] });
  });

  it("terminal profiles name their processor", () => {
    expect(getProfile("mock_terminal")).toMatchObject({ kind: "terminal", processor: "mock" });
    expect(getProfile("moneris_cloud")).toMatchObject({ kind: "terminal", processor: "moneris" });
  });

  it("returns undefined for an unknown profile", () => {
    expect(getProfile("does_not_exist")).toBeUndefined();
  });

  it("getProfileOfKind filters by kind", () => {
    expect(getProfileOfKind("printer", "epson_tm_t88v")?.commandSet).toBe("escpos");
    expect(getProfileOfKind("scanner", "epson_tm_t88v")).toBeUndefined();
  });
});
