import { getProfileOfKind } from "./profiles";

// Physical-cash tenders that open the drawer. Card/gift NEVER open it.
const KICK_TENDERS = new Set(["CASH", "CHEQUE", "CHECK"]);

/**
 * Money-safety gate: the cash drawer kicks ONLY for cash/cheque tenders, NEVER
 * for Interac/credit/gift. Case-insensitive; robust to any tender string.
 */
export function shouldKickDrawer(tender: string): boolean {
  return KICK_TENDERS.has(tender.toUpperCase());
}

const EPSON_KICK_2 = [0x1b, 0x70, 0x00, 0x19, 0xfa];
const EPSON_KICK_5 = [0x1b, 0x70, 0x01, 0x19, 0xfa];

/** Kick bytes for pin 2 or pin 5, from the drawer profile (dual-drawer support). */
export function drawerKickBytes(pin: 2 | 5, profileName = "valuline_via_epson"): number[] {
  const profile = getProfileOfKind("drawer", profileName);
  if (!profile) return pin === 5 ? [...EPSON_KICK_5] : [...EPSON_KICK_2];
  return pin === 5 ? [...profile.kickPin5] : [...profile.kickPin2];
}
