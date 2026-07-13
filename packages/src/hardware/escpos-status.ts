export interface PrinterStatus {
  paperOut: boolean;
  coverOpen: boolean;
  drawerOpen: boolean;
}

/** Epson real-time status query bytes (DLE EOT n). */
export const STATUS_QUERY = {
  printer: [0x10, 0x04, 0x01], // n=1 printer status (incl. drawer kick pin)
  offline: [0x10, 0x04, 0x02], // n=2 offline cause (incl. cover)
  paper: [0x10, 0x04, 0x04], // n=4 paper sensor
} as const;

/**
 * Parse the three Epson real-time status bytes (DLE EOT 1/2/4) into a
 * PrinterStatus. Documented convention (model quirks refine via profile):
 * DLE EOT 1 bit2 (0x04) drawer pin HIGH = open; DLE EOT 2 bit2 (0x04) = cover
 * open; DLE EOT 4 bits5,6 (0x60) = paper end.
 */
export function parsePrinterStatus(
  printerByte: number,
  offlineByte: number,
  paperByte: number,
): PrinterStatus {
  return {
    drawerOpen: (printerByte & 0x04) !== 0,
    coverOpen: (offlineByte & 0x04) !== 0,
    paperOut: (paperByte & 0x60) === 0x60,
  };
}
