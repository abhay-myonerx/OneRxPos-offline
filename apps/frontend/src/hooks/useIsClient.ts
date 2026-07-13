// Uses useSyncExternalStore — React's official API for reading external data
// that differs between server and client, without any setState inside effects.
//
// Server snapshot → false  (nothing renders on SSR)
// Client snapshot → true   (layout renders after hydration)
//
// This completely avoids the "setState in effect" warning while still
// preventing hydration mismatches from localStorage access.

import { useSyncExternalStore } from "react";

const subscribe = () => () => {}; // no external subscription needed

export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe, // subscribe:        no-op (value never changes after mount)
    () => true, // getClientSnapshot: always true on client
    () => false, // getServerSnapshot: always false on server
  );
}
