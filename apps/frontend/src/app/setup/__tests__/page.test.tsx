import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

// SN-5 OPS-1: the Setup wizard's access-code field must auto-fill + lock
// when the desktop shell exposes window.rxpos.setup.accessCode (a store-node
// with no "server administrator" to hand the code to separately), and must
// keep behaving exactly like before (manual, required, editable) on a plain
// web/PWA build where that bridge doesn't exist.
//
// Heavy dependencies (RTK Query mutation, Redux dispatch, router, toasts) are
// mocked out so the page renders standalone — same pattern as
// app/(dashboard)/pos/__tests__/page.test.tsx and
// app/(dashboard)/reports/__tests__/pharmacy-tabs.test.tsx.

const navigate = vi.fn();
vi.mock("@/shell/nav", () => ({
  useNavigate: () => navigate,
}));

const dispatch = vi.fn();
vi.mock("@/store/hooks", () => ({
  useAppDispatch: () => dispatch,
}));

vi.mock("@/lib/api/error-handler", () => ({
  showApiError: vi.fn(),
  showSuccess: vi.fn(),
}));

const completeSetupUnwrap = vi.fn(() =>
  Promise.resolve({
    accessToken: "tok",
    refreshToken: "refresh",
    user: { id: "u1", role: "ADMIN" },
    tenant: { id: "t1" },
  }),
);
const completeSetupTrigger = vi.fn(() => ({ unwrap: completeSetupUnwrap }));
vi.mock("@/features/setup/api/setup.api", () => ({
  useCompleteSetupMutation: () => [completeSetupTrigger, { isLoading: false }],
}));

import SetupPage from "../page";

describe("Setup wizard — access code field (SN-5 OPS-1)", () => {
  afterEach(() => {
    delete (window as unknown as { rxpos?: unknown }).rxpos;
    vi.clearAllMocks();
  });

  it("shows the manual, required access-code input when no desktop bridge is present (web/PWA)", () => {
    render(<SetupPage />);

    expect(screen.getByPlaceholderText("Paste your access code")).toBeInTheDocument();
    expect(screen.queryByText("Provided by this device")).not.toBeInTheDocument();
  });

  it("hides the access-code field entirely when the desktop shell provides the code", async () => {
    (window as unknown as { rxpos: { setup: { accessCode: string } } }).rxpos = {
      setup: { accessCode: "desktop-generated-code" },
    };

    render(<SetupPage />);

    // The code is auto-applied behind the scenes — no field, label, or input is
    // shown on the desktop store-node (nothing for the operator to type/click).
    await waitFor(() => expect(screen.getByPlaceholderText("Acme Corp")).toBeInTheDocument());
    expect(screen.queryByText("Setup Access Code")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Paste your access code")).not.toBeInTheDocument();
  });

  it("does not require manual accessCode entry to advance past step 1 when the desktop code is present", async () => {
    (window as unknown as { rxpos: { setup: { accessCode: string } } }).rxpos = {
      setup: { accessCode: "desktop-generated-code" },
    };

    render(<SetupPage />);
    // The access-code field is hidden on desktop; wait for step 1 to render.
    await waitFor(() => expect(screen.getByPlaceholderText("Acme Corp")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("Acme Corp"), {
      target: { value: "Acme Pharmacy" },
    });
    fireEvent.change(screen.getByPlaceholderText("info@acme.com"), {
      target: { value: "biz@acme.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    // Advancing to step 2 proves validateStep(1) passed without the operator
    // ever typing an access code. Matched by heading role — "Create the
    // admin account" also appears as a step label in the sidebar checklist.
    expect(
      await screen.findByRole("heading", { name: "Create the admin account" }),
    ).toBeInTheDocument();
  });
});
