import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { I18nextProvider } from "react-i18next";
import authReducer, { setCredentials } from "@/store/auth.slice";
import i18n from "@/lib/i18n/i18n";
import { SwitchUserButton } from "../SwitchUserButton";

const mockUnwrap = vi.fn();
const mockLogoutTrigger = vi.fn(() => ({ unwrap: mockUnwrap }));

vi.mock("../../../auth/api/auth.api", () => ({
  useLogoutMutation: () => [mockLogoutTrigger, { isLoading: false }],
}));

function renderButton(onSwitchUser?: () => void) {
  const store = configureStore({ reducer: { auth: authReducer } });
  store.dispatch(
    setCredentials({ accessToken: "tok-abc", user: null, tenant: null }),
  );
  render(
    <Provider store={store}>
      <I18nextProvider i18n={i18n}>
        <SwitchUserButton onSwitchUser={onSwitchUser} />
      </I18nextProvider>
    </Provider>,
  );
  return store;
}

describe("SwitchUserButton", () => {
  beforeEach(() => {
    mockLogoutTrigger.mockClear();
    mockUnwrap.mockReset();
    mockUnwrap.mockResolvedValue(undefined);
  });

  it("clears the session (logout) and calls onSwitchUser so the caller can land on PinPadLogin", async () => {
    const onSwitchUser = vi.fn();
    const store = renderButton(onSwitchUser);
    expect(store.getState().auth.isAuthenticated).toBe(true);

    await userEvent.click(screen.getByRole("button", { name: /switch user/i }));

    expect(store.getState().auth.isAuthenticated).toBe(false);
    expect(store.getState().auth.accessToken).toBeNull();
    expect(onSwitchUser).toHaveBeenCalledTimes(1);
  });

  it("revokes the server-side session (POST /auth/logout) on switch, closing the residual-privilege gap where a background 401 could silently refresh off the still-valid enrollment-time cookie", async () => {
    const store = renderButton();

    await userEvent.click(screen.getByRole("button", { name: /switch user/i }));

    expect(mockLogoutTrigger).toHaveBeenCalledTimes(1);
    expect(store.getState().auth.isAuthenticated).toBe(false);
  });

  it("still clears local session even if the backend logout call fails (tolerant of network failure)", async () => {
    mockUnwrap.mockReset();
    mockUnwrap.mockRejectedValue(new Error("network down"));
    const onSwitchUser = vi.fn();
    const store = renderButton(onSwitchUser);

    await userEvent.click(screen.getByRole("button", { name: /switch user/i }));

    expect(mockLogoutTrigger).toHaveBeenCalledTimes(1);
    expect(store.getState().auth.isAuthenticated).toBe(false);
    expect(onSwitchUser).toHaveBeenCalledTimes(1);
  });
});
