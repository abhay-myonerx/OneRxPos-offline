// Device-profile quirk registry (Phase 2.10). Model-specific behavior is DATA
// keyed by the `profile` string — drivers look quirks up here and NEVER branch
// on brand. Byte sequences are number[] so the source stays plain ASCII.

export type CommandSet = "escpos" | "star" | "zpl";

export interface PrinterProfile {
  kind: "printer";
  commandSet: CommandSet;
  widthCols: number;
  cut: "full" | "partial" | "both" | "tear";
  codepage?: string; // undefined = ASCII-only; e.g. "cp858" for French accents
  drawerKickPin2: number[];
  drawerKickPin5: number[];
}

export interface ScannerProfile {
  kind: "scanner";
  interface: "hid" | "ncr-usb" | "rs232";
  suffix: string;
  prefix: string;
}

export interface DrawerProfile {
  kind: "drawer";
  via: "printer" | "usb";
  kickPin2: number[];
  kickPin5: number[];
}

export interface ScaleProfile {
  kind: "scale";
  protocol: "nci" | "toledo" | "cas";
  pollCmd: number[]; // empty = continuous stream (no poll)
}

export interface TerminalProfile {
  kind: "terminal";
  processor: "mock" | "moneris" | "globalpay" | "stripe" | "chase" | "elavon" | "square";
}

export type DeviceProfileQuirks =
  | PrinterProfile
  | ScannerProfile
  | DrawerProfile
  | ScaleProfile
  | TerminalProfile;

const EPSON_KICK_2 = [0x1b, 0x70, 0x00, 0x19, 0xfa];
const EPSON_KICK_5 = [0x1b, 0x70, 0x01, 0x19, 0xfa];
// Star drawer pulse differs from Epson (the #1 gotcha). Pin-5 varies by model;
// a profile can override it. ESC BEL n m.
const STAR_KICK = [0x1b, 0x07, 0x0b, 0x37, 0x05];

const REGISTRY: Record<string, DeviceProfileQuirks> = {
  // ── printers ──────────────────────────────────────────────────────────────
  epson_tm_t88v: { kind: "printer", commandSet: "escpos", widthCols: 48, cut: "both", codepage: "cp858", drawerKickPin2: EPSON_KICK_2, drawerKickPin5: EPSON_KICK_5 },
  epson_tm_t20iii: { kind: "printer", commandSet: "escpos", widthCols: 48, cut: "partial", codepage: "cp858", drawerKickPin2: EPSON_KICK_2, drawerKickPin5: EPSON_KICK_5 },
  epson_tm_m30: { kind: "printer", commandSet: "escpos", widthCols: 48, cut: "full", codepage: "cp858", drawerKickPin2: EPSON_KICK_2, drawerKickPin5: EPSON_KICK_5 },
  star_tsp143: { kind: "printer", commandSet: "star", widthCols: 48, cut: "full", drawerKickPin2: STAR_KICK, drawerKickPin5: STAR_KICK },
  bixolon_srp350iii: { kind: "printer", commandSet: "escpos", widthCols: 48, cut: "partial", codepage: "cp858", drawerKickPin2: EPSON_KICK_2, drawerKickPin5: EPSON_KICK_5 },
  zebra_zd410: { kind: "printer", commandSet: "zpl", widthCols: 0, cut: "tear", drawerKickPin2: [], drawerKickPin5: [] },
  // ── scanners ──────────────────────────────────────────────────────────────
  zebra_ds2208: { kind: "scanner", interface: "hid", suffix: "\r", prefix: "" },
  honeywell_voyager_1250: { kind: "scanner", interface: "hid", suffix: "\r", prefix: "" },
  symbol_ls2208: { kind: "scanner", interface: "hid", suffix: "\r", prefix: "" },
  datalogic_quickscan: { kind: "scanner", interface: "hid", suffix: "\t", prefix: "" },
  ncr_realscan_7874_hybrid: { kind: "scanner", interface: "ncr-usb", suffix: "\r", prefix: "" },
  "2d_gs1_datamatrix": { kind: "scanner", interface: "hid", suffix: "\r", prefix: "]d2" },
  // ── drawers ───────────────────────────────────────────────────────────────
  valuline_via_epson: { kind: "drawer", via: "printer", kickPin2: EPSON_KICK_2, kickPin5: EPSON_KICK_5 },
  apg_via_epson: { kind: "drawer", via: "printer", kickPin2: EPSON_KICK_2, kickPin5: EPSON_KICK_5 },
  mmf_via_epson: { kind: "drawer", via: "printer", kickPin2: EPSON_KICK_2, kickPin5: EPSON_KICK_5 },
  drawer_via_star: { kind: "drawer", via: "printer", kickPin2: STAR_KICK, kickPin5: STAR_KICK },
  // ── scales ────────────────────────────────────────────────────────────────
  nci_scp01: { kind: "scale", protocol: "nci", pollCmd: [0x57, 0x0d] }, // "W\r"
  ncr_realscan_scale: { kind: "scale", protocol: "nci", pollCmd: [0x57, 0x0d] },
  toledo_8217: { kind: "scale", protocol: "toledo", pollCmd: [0x05] }, // ENQ
  cas_pd2: { kind: "scale", protocol: "cas", pollCmd: [] }, // continuous stream
  // ── terminals ─────────────────────────────────────────────────────────────
  mock_terminal: { kind: "terminal", processor: "mock" },
  moneris_cloud: { kind: "terminal", processor: "moneris" },
  globalpay_upa: { kind: "terminal", processor: "globalpay" },
  stripe_terminal: { kind: "terminal", processor: "stripe" },
};

export function getProfile(name: string): DeviceProfileQuirks | undefined {
  return REGISTRY[name];
}

export function getProfileOfKind<K extends DeviceProfileQuirks["kind"]>(
  kind: K,
  name: string,
): Extract<DeviceProfileQuirks, { kind: K }> | undefined {
  const p = REGISTRY[name];
  return p && p.kind === kind ? (p as Extract<DeviceProfileQuirks, { kind: K }>) : undefined;
}
