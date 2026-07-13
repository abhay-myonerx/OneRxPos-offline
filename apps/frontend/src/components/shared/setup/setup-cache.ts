// Module-level cache for the /setup/status response.
// SetupGuard reads this; the wizard updates it after a successful POST so we
// don't bounce the freshly-logged-in user back to /setup on next navigation.

export interface SetupStatusCache {
  setupRequired: boolean;
}

let cached: SetupStatusCache | null = null;

export function getCachedSetupStatus(): SetupStatusCache | null {
  return cached;
}

export function setCachedSetupStatus(value: SetupStatusCache | null): void {
  cached = value;
}
