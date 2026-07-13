// Raw printing to a Windows printer queue (RAW datatype) — for USB receipt
// printers that install as a Windows printer and DON'T expose a virtual COM
// port, so no serialport/COM and no libusb/Zadig driver swap is needed.
//
// Implemented WITHOUT any native npm module: we spawn PowerShell and P/Invoke
// winspool.drv (OpenPrinter/StartDocPrinter[RAW]/WritePrinter/…). Add-Type uses
// the .NET compiler that ships with every Windows install, so there's nothing
// to build or bundle. The printer name + data-file path are passed via env
// vars (never interpolated into the command line) so there's no injection
// surface; the fixed script is passed as an EncodedCommand.
import { spawn } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";

// Fixed PowerShell script — reads the printer name + data file from the
// environment, sends the bytes RAW to the spooler. No string interpolation.
const RAW_PRINT_SCRIPT = `
$ErrorActionPreference = 'Stop'
$printer = $env:RXPOS_PRINTER
$dataFile = $env:RXPOS_DATAFILE
Add-Type -Namespace RxRaw -Name Spooler -MemberDefinition @'
[StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
public struct DOCINFO { public string pDocName; public string pOutputFile; public string pDatatype; }
[DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool OpenPrinter(string src, out IntPtr h, IntPtr def);
[DllImport("winspool.drv", SetLastError=true)] public static extern bool ClosePrinter(IntPtr h);
[DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern int StartDocPrinter(IntPtr h, int level, ref DOCINFO di);
[DllImport("winspool.drv", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr h);
[DllImport("winspool.drv", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr h);
[DllImport("winspool.drv", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr h);
[DllImport("winspool.drv", SetLastError=true)] public static extern bool WritePrinter(IntPtr h, byte[] buf, int count, out int written);
'@
$bytes = [System.IO.File]::ReadAllBytes($dataFile)
$h = [IntPtr]::Zero
if (-not [RxRaw.Spooler]::OpenPrinter($printer, [ref]$h, [IntPtr]::Zero)) { throw "OpenPrinter failed for '$printer'" }
try {
  $di = New-Object RxRaw.Spooler+DOCINFO
  $di.pDocName = 'RX POS Receipt'
  $di.pDatatype = 'RAW'
  if ([RxRaw.Spooler]::StartDocPrinter($h, 1, [ref]$di) -eq 0) { throw 'StartDocPrinter failed' }
  [void][RxRaw.Spooler]::StartPagePrinter($h)
  $written = 0
  if (-not [RxRaw.Spooler]::WritePrinter($h, $bytes, $bytes.Length, [ref]$written)) { throw 'WritePrinter failed' }
  [void][RxRaw.Spooler]::EndPagePrinter($h)
  [void][RxRaw.Spooler]::EndDocPrinter($h)
} finally { [void][RxRaw.Spooler]::ClosePrinter($h) }
`;

function runPowerShell(script: string, env: NodeJS.ProcessEnv, timeoutMs = 15000): Promise<void> {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
      { env: { ...process.env, ...env }, windowsHide: true },
    );
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("windows raw print timed out"));
    }, timeoutMs);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`windows raw print failed: ${stderr.trim() || `exit ${code}`}`));
    });
  });
}

/** Send raw ESC/POS bytes to a named Windows printer via the spooler (RAW). */
export async function printRawToWindowsPrinter(
  printerName: string,
  bytes: Uint8Array,
): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("windows-printer transport is only available on Windows");
  }
  const dataFile = path.join(os.tmpdir(), `rxpos-raw-${randomBytes(8).toString("hex")}.bin`);
  await writeFile(dataFile, Buffer.from(bytes));
  try {
    await runPowerShell(RAW_PRINT_SCRIPT, { RXPOS_PRINTER: printerName, RXPOS_DATAFILE: dataFile });
  } finally {
    await unlink(dataFile).catch(() => {});
  }
}

/** List installed Windows printer queue names (for the settings pick-list). */
export async function listWindowsPrinters(): Promise<string[]> {
  if (process.platform !== "win32") return [];
  return new Promise<string[]>((resolve) => {
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Get-Printer | Select-Object -ExpandProperty Name",
      ],
      { windowsHide: true },
    );
    let out = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.on("error", () => resolve([]));
    child.on("close", () => {
      resolve(
        out
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean),
      );
    });
  });
}
