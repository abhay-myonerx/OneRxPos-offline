// Emitted by PIN quick-login when the (userId, deviceFingerprint) pair is
// currently locked out (see `lockout.ts`/`pin.service.ts`). Distinct from a
// plain wrong-PIN `AuthenticationError` (401) so callers (the PIN pad UI)
// can branch on STATUS/CODE rather than pattern-matching the English
// error message. HTTP 423 (Locked) is the closest standard status for
// "resource temporarily locked due to a failed-attempt policy".

import { AppError } from "./AppError";

export class PinLockedError extends AppError {
  constructor(message = "PIN is locked — try again later") {
    super(423, "PIN_LOCKED", message);
    this.name = "PinLockedError";
  }
}
