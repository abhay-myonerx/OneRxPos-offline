import type { RxposBridge } from "../src/bridge/contract";

declare global {
  interface Window {
    rxpos: RxposBridge;
  }
}
export {};
