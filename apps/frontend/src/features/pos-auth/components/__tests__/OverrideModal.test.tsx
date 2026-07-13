import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import i18n from "@/lib/i18n/i18n";
import { OverrideModal } from "../OverrideModal";

const mockUnwrap = vi.fn();
const mockTrigger = vi.fn(() => ({ unwrap: mockUnwrap }));
const mockGetLaneFingerprint = vi.fn(() => Promise.resolve("fp-test-123"));

vi.mock("../../api/pos-auth.api", () => ({
  useRequestOverrideMutation: () => [mockTrigger, { isLoading: false }],
  getLaneFingerprint: () => mockGetLaneFingerprint(),
}));

async function renderModal(overrides: Partial<React.ComponentProps<typeof OverrideModal>> = {}) {
  const onClose = vi.fn();
  const onGranted = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <OverrideModal
        open
        onClose={onClose}
        action="VOID_TRANSACTION"
        context="txn-123"
        authorizerUserId="mgr-1"
        onGranted={onGranted}
        {...overrides}
      />
    </I18nextProvider>,
  );
  // The Modal component mounts hidden and flips to visible (clearing
  // aria-hidden on its wrapper) via a double requestAnimationFrame — wait
  // for that before interacting, or the PIN buttons aren't in the
  // accessibility tree yet.
  await waitFor(() => {
    expect(screen.getByRole("dialog", { hidden: true })).toHaveClass("opacity-100");
  });
  return { onClose, onGranted };
}

async function clickDigits(digits: string) {
  for (const d of digits) {
    await userEvent.click(screen.getByRole("button", { name: d }));
  }
}

describe("OverrideModal", () => {
  beforeEach(() => {
    mockTrigger.mockClear();
    mockUnwrap.mockReset();
    mockGetLaneFingerprint.mockClear();
  });

  it("collects the authorizer's PIN, calls the override mutation with action/authorizerUserId/pin/deviceFingerprint/context, and calls onGranted on success", async () => {
    mockUnwrap.mockResolvedValue({ grant: "grant-token-abc" });
    const { onGranted } = await renderModal();

    await clickDigits("428193");

    await waitFor(() => {
      expect(mockTrigger).toHaveBeenCalledWith({
        action: "VOID_TRANSACTION",
        authorizerUserId: "mgr-1",
        pin: "428193",
        deviceFingerprint: "fp-test-123",
        context: "txn-123",
      });
    });
    await waitFor(() => {
      expect(onGranted).toHaveBeenCalledWith("grant-token-abc");
    });
  });

  it("shows a lockout error on a 423/PIN_LOCKED response (the ACTUAL status override.service.ts's PinLockedError emits when the authorizer's PIN is locked) and does not call onGranted", async () => {
    mockUnwrap.mockRejectedValue({
      status: 423,
      data: {
        success: false,
        error: { code: "PIN_LOCKED", message: "PIN is locked — try again later" },
      },
    });
    const { onGranted } = await renderModal();

    await clickDigits("111111");

    expect(await screen.findByRole("alert")).toHaveTextContent(/locked/i);
    expect(onGranted).not.toHaveBeenCalled();
  });

  it("shows a wrong-PIN error on a 401 response (the ACTUAL status override.service.ts's AuthenticationError emits for a bad/unknown authorizer credential)", async () => {
    mockUnwrap.mockRejectedValue({
      status: 401,
      data: { success: false, error: { code: "AUTHENTICATION_ERROR", message: "Invalid authorizer or PIN" } },
    });
    await renderModal();

    await clickDigits("111111");

    expect(await screen.findByRole("alert")).toHaveTextContent(/incorrect pin/i);
  });

  it("shows a distinct not-authorized error on a 403 response (the ACTUAL status override.service.ts's AuthorizationError emits when the authorizer lacks the action's permission)", async () => {
    mockUnwrap.mockRejectedValue({
      status: 403,
      data: {
        success: false,
        error: { code: "AUTHORIZATION_ERROR", message: "Authorizer lacks permission for sale:void" },
      },
    });
    const { onGranted } = await renderModal();

    await clickDigits("111111");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/not authorized/i);
    // Distinct from the wrong-PIN and lockout copy.
    expect(alert).not.toHaveTextContent(/incorrect pin/i);
    expect(alert).not.toHaveTextContent(/locked/i);
    expect(onGranted).not.toHaveBeenCalled();
  });

  it("shows a generic error for a non-auth failure (e.g. network/500)", async () => {
    mockUnwrap.mockRejectedValue({
      status: 500,
      data: { success: false, error: { code: "INTERNAL_ERROR", message: "boom" } },
    });
    await renderModal();

    await clickDigits("111111");

    const alert = await screen.findByRole("alert");
    expect(alert).not.toHaveTextContent(/incorrect pin/i);
    expect(alert.textContent).toBeTruthy();
  });
});
