import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { I18nextProvider } from "react-i18next";
import authReducer from "@/store/auth.slice";
import i18n from "@/lib/i18n/i18n";
import { PinPadLogin } from "../PinPadLogin";

const mockUnwrap = vi.fn();
const mockTrigger = vi.fn(() => ({ unwrap: mockUnwrap }));
const mockGetLaneFingerprint = vi.fn(() => Promise.resolve("fp-test-123"));

vi.mock("../../api/pos-auth.api", () => ({
  usePinLoginMutation: () => [mockTrigger, { isLoading: false }],
  getLaneFingerprint: () => mockGetLaneFingerprint(),
}));

function renderPinPad(userId = "user-1") {
  const store = configureStore({ reducer: { auth: authReducer } });
  render(
    <Provider store={store}>
      <I18nextProvider i18n={i18n}>
        <PinPadLogin userId={userId} />
      </I18nextProvider>
    </Provider>,
  );
  return store;
}

async function clickDigits(digits: string) {
  for (const d of digits) {
    await userEvent.click(screen.getByRole("button", { name: d }));
  }
}

describe("PinPadLogin", () => {
  beforeEach(() => {
    mockTrigger.mockClear();
    mockUnwrap.mockReset();
    mockGetLaneFingerprint.mockClear();
  });

  it("auto-submits pin-login with the fingerprint + userId + pin after 6 digits — exactly once", async () => {
    mockUnwrap.mockResolvedValue({ accessToken: "tok-abc", refreshToken: "ref-abc" });
    renderPinPad("user-1");

    await clickDigits("428193");

    await waitFor(() => {
      expect(mockTrigger).toHaveBeenCalledWith({
        deviceFingerprint: "fp-test-123",
        userId: "user-1",
        pin: "428193",
      });
    });
    // Regression: submit used to be triggered from inside the `setPin`
    // functional updater, which React Strict Mode double-invokes in dev —
    // causing a double pin-login call (and a double lockout increment).
    // It must fire exactly once per completed 6-digit entry.
    expect(mockTrigger).toHaveBeenCalledTimes(1);
  });

  it("dispatches setCredentials with the returned access token on success", async () => {
    mockUnwrap.mockResolvedValue({ accessToken: "tok-abc", refreshToken: "ref-abc" });
    const store = renderPinPad("user-1");

    await clickDigits("428193");

    await waitFor(() => {
      expect(store.getState().auth.isAuthenticated).toBe(true);
    });
    expect(store.getState().auth.accessToken).toBe("tok-abc");
  });

  it("shows a wrong-PIN error and clears entry when the server rejects the PIN", async () => {
    mockUnwrap.mockRejectedValue({
      status: 401,
      data: { success: false, error: { code: "AUTHENTICATION_ERROR", message: "Invalid PIN" } },
    });
    renderPinPad("user-1");

    await clickDigits("111111");

    expect(await screen.findByRole("alert")).toHaveTextContent(/incorrect pin/i);
  });

  it("shows a lockout error on a 423/PIN_LOCKED response — branches on status/code, not string-matching", async () => {
    mockUnwrap.mockRejectedValue({
      status: 423,
      data: {
        success: false,
        error: { code: "PIN_LOCKED", message: "PIN is locked — try again later" },
      },
    });
    renderPinPad("user-1");

    await clickDigits("111111");

    expect(await screen.findByRole("alert")).toHaveTextContent(/locked/i);
  });

  it("shows a device-not-enrolled error distinct from wrong-PIN when the device isn't enrolled", async () => {
    mockUnwrap.mockRejectedValue({
      status: 401,
      data: {
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: "Device is not enrolled" },
      },
    });
    renderPinPad("user-1");

    await clickDigits("111111");

    expect(await screen.findByRole("alert")).toHaveTextContent(/enroll/i);
  });

  it("shows the generic error for a non-auth failure (e.g. network/500), not the wrong-PIN message", async () => {
    mockUnwrap.mockRejectedValue({ status: 500, data: { success: false, error: { code: "INTERNAL_ERROR", message: "boom" } } });
    renderPinPad("user-1");

    await clickDigits("111111");

    const alert = await screen.findByRole("alert");
    expect(alert).not.toHaveTextContent(/incorrect pin/i);
    expect(alert.textContent).toBeTruthy();
  });
});
