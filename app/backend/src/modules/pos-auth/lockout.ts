export interface LockoutState { attempts: number; lockedUntil: number | null; }

export function evaluateLockout(state: LockoutState, now: number, _max: number, _lockoutMs: number) {
  const locked = state.lockedUntil != null && state.lockedUntil > now;
  return { locked, lockedUntil: locked ? state.lockedUntil : null };
}

export function nextFailure(state: LockoutState, now: number, maxAttempts: number, lockoutMs: number): LockoutState {
  const attempts = state.attempts + 1;
  return { attempts, lockedUntil: attempts >= maxAttempts ? now + lockoutMs : null };
}
