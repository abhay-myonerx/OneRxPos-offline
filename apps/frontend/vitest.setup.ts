import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

beforeEach(() => {
  // Unit tests never hit a real backend. RTK Query queries then land in their
  // error state synchronously, so auth/setup guards take their deterministic
  // fail path with zero socket I/O (no flaky connection-refused timing).
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("network disabled in unit tests"))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});
