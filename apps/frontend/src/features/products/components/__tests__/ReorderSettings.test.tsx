import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const updateSpy = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
let settings: { reorder?: { autoReorderEnabled: boolean; autoEmailReorder: boolean } } = {};

vi.mock("@/features/tenant/api/tenant.api", () => ({
  useGetTenantSettingsQuery: () => ({ data: settings }),
  useUpdateTenantSettingsMutation: () => [updateSpy, { isLoading: false }],
}));
vi.mock("@/lib/api/error-handler", () => ({ showApiError: vi.fn(), showSuccess: vi.fn() }));

import { ReorderSettings } from "../ReorderSettings";

beforeEach(() => {
  settings = {};
  vi.clearAllMocks();
});

describe("ReorderSettings", () => {
  it("defaults to both toggles off when unset", () => {
    render(<ReorderSettings />);
    const [auto, email] = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(auto.checked).toBe(false);
    expect(email.checked).toBe(false);
    expect(email.disabled).toBe(true); // email disabled until auto-reorder on
  });

  it("enabling auto-reorder saves the namespace", () => {
    render(<ReorderSettings />);
    fireEvent.click(
      screen.getByLabelText(/Automatically draft a purchase order/i),
    );
    expect(updateSpy).toHaveBeenCalledWith({
      reorder: { autoReorderEnabled: true, autoEmailReorder: false },
    });
  });

  it("reflects saved settings", () => {
    settings = { reorder: { autoReorderEnabled: true, autoEmailReorder: false } };
    render(<ReorderSettings />);
    const [auto, email] = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(auto.checked).toBe(true);
    expect(email.disabled).toBe(false);
  });
});
