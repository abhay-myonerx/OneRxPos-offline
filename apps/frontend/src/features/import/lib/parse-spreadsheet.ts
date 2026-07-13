// 3H.3 — parse a CSV/XLSX file in the browser (SheetJS). Returns the header row
// + object rows keyed by header. The server re-validates everything.
//
// xlsx (~1MB+) is loaded via a DYNAMIC import so SheetJS lands in its own lazy
// chunk instead of the app-shell bundle — catalog import is an admin-only
// action, and keeping it out of the main chunk keeps that chunk under the PWA
// precache size limit and off the tablet's cold-launch critical path.

export interface ParsedSheet {
  headers: string[];
  rows: Record<string, string>[];
}

export async function parseSpreadsheet(file: File | ArrayBuffer): Promise<ParsedSheet> {
  const XLSX = await import("xlsx");
  // Accept a File/Blob (has .arrayBuffer()) or a raw ArrayBuffer/typed array.
  const buf =
    typeof (file as { arrayBuffer?: unknown }).arrayBuffer === "function"
      ? await (file as File).arrayBuffer()
      : (file as ArrayBuffer);
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { headers: [], rows: [] };

  // header:1 → array-of-arrays; the first row is the header.
  // raw:false → use each cell's FORMATTED text, so e.g. a text-formatted barcode
  // keeps its leading zeros rather than being coerced to a number.
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: "", raw: false });
  if (aoa.length === 0) return { headers: [], rows: [] };

  const headers = (aoa[0] as unknown[]).map((h) => String(h ?? "").trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const arr = aoa[i] as unknown[];
    if (!arr || arr.every((c) => String(c ?? "").trim() === "")) continue; // skip blank rows
    const obj: Record<string, string> = {};
    headers.forEach((h, j) => {
      if (h) obj[h] = String(arr[j] ?? "").trim();
    });
    rows.push(obj);
  }
  return { headers, rows };
}
