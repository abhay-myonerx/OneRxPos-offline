import { getProfileOfKind } from "./profiles";

export interface ScannerDecode {
  data: string;
  symbology: string; // "datamatrix" for ]d2 (GS1), else "unknown"
}

/**
 * Apply a scanner profile to raw keyboard-wedge input: detect the GS1 DataMatrix
 * AIM prefix (]d2, drug packaging), then strip the profile's prefix + suffix
 * (e.g. CR vs Tab). With no profile, strips a trailing CR/LF/Tab.
 */
export function decodeScannerInput(raw: string, profileName?: string): ScannerDecode {
  let data = raw;
  let symbology = "unknown";

  // AIM DataMatrix identifier ]d2 — GS1 DataMatrix on Rx/drug packaging.
  if (data.startsWith("]d2")) {
    symbology = "datamatrix";
    data = data.slice(3);
  }

  const profile = profileName ? getProfileOfKind("scanner", profileName) : undefined;
  if (profile) {
    if (profile.prefix && data.startsWith(profile.prefix)) data = data.slice(profile.prefix.length);
    if (profile.suffix && data.endsWith(profile.suffix)) data = data.slice(0, -profile.suffix.length);
  } else {
    data = data.replace(/[\r\n\t]+$/, "");
  }

  return { data, symbology };
}
