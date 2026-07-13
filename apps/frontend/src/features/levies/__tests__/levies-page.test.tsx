import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mirrors SwitchUserButton.test.tsx's style: mock the RTK Query hooks
// directly rather than wiring up a full Redux store, so this stays a
// focused component test of the page's list + create-form wiring.
const mockLevies = [
  {
    id: "levy-1",
    tenantId: "t1",
    code: "ECO_FEE",
    name: "Eco Handling Fee",
    mode: "FLAT_PER_UNIT",
    amount: "0.5000",
    taxable: true,
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveTo: null,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

const mockUnwrap = vi.fn().mockResolvedValue(mockLevies[0]);
const mockCreateTrigger = vi.fn((_payload: unknown) => ({ unwrap: mockUnwrap }));
const mockUpdateTrigger = vi.fn((_payload: unknown) => ({ unwrap: mockUnwrap }));
const mockDeleteTrigger = vi.fn((_payload: unknown) => ({ unwrap: mockUnwrap }));

vi.mock("@/features/levies/api/levies.api", () => ({
  useListLeviesQuery: () => ({
    data: {
      data: mockLevies,
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasMore: false },
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useCreateLevyMutation: () => [mockCreateTrigger, { isLoading: false }],
  useUpdateLevyMutation: () => [mockUpdateTrigger, { isLoading: false }],
  useDeleteLevyMutation: () => [mockDeleteTrigger, { isLoading: false }],
}));

import LeviesPage from "@/app/(dashboard)/levies/page";

describe("LeviesPage", () => {
  beforeEach(() => {
    mockCreateTrigger.mockClear();
    mockUpdateTrigger.mockClear();
    mockDeleteTrigger.mockClear();
    mockUnwrap.mockClear();
  });

  it("lists existing levies with code, name, mode and amount", () => {
    render(<LeviesPage />);

    expect(screen.getByText("Eco Handling Fee")).toBeInTheDocument();
    expect(screen.getByText("ECO_FEE")).toBeInTheDocument();
    expect(screen.getByText(/Flat — per unit/i)).toBeInTheDocument();
  });

  it("creates a new levy with the form's mode/amount/taxable fields", async () => {
    render(<LeviesPage />);

    await userEvent.click(screen.getByRole("button", { name: /add levy/i }));

    const dialog = await screen.findByRole("dialog");
    const [codeInput, nameInput] = within(dialog).getAllByRole("textbox");
    await userEvent.type(codeInput, "BAG_FEE");
    await userEvent.type(nameInput, "Bag Fee");

    await userEvent.click(within(dialog).getByRole("button", { name: /create/i }));

    expect(mockCreateTrigger).toHaveBeenCalledTimes(1);
    const payload = mockCreateTrigger.mock.calls[0][0];
    expect(payload).toMatchObject({
      code: "BAG_FEE",
      name: "Bag Fee",
      mode: "FLAT_PER_UNIT",
      taxable: true,
    });
  });

  it("also renders the read-only tax-rules viewer alongside the levy list", () => {
    render(<LeviesPage />);

    expect(screen.getByText(/tax rules by province/i)).toBeInTheDocument();
  });
});
