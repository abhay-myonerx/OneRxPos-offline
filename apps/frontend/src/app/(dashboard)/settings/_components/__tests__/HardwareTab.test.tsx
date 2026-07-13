import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DeviceProfileDto } from "@/features/hardware/hardware.api";
import { HardwareTab } from "../HardwareTab";

const printer: DeviceProfileDto = {
  id: "d1",
  storeId: "s1",
  kind: "printer",
  label: "Front printer",
  transport: "network",
  connection: { kind: "network", ip: "192.168.1.50", port: 9100 },
  ownerStationId: null,
  protocol: null,
  config: null,
  isActive: true,
  createdAt: "2026-07-07T00:00:00.000Z",
  updatedAt: "2026-07-07T00:00:00.000Z",
};

const mockCreateUnwrap = vi.fn(() => Promise.resolve(printer));
const mockDeleteUnwrap = vi.fn(() => Promise.resolve(undefined));
const mockTestPrintUnwrap = vi.fn(() => Promise.resolve({ ok: true }));
const mockCreate = vi.fn(() => ({ unwrap: mockCreateUnwrap }));
const mockUpdate = vi.fn(() => ({ unwrap: vi.fn(() => Promise.resolve(printer)) }));
const mockDelete = vi.fn(() => ({ unwrap: mockDeleteUnwrap }));
const mockTestPrint = vi.fn(() => ({ unwrap: mockTestPrintUnwrap }));
const mockTestDrawer = vi.fn(() => ({ unwrap: vi.fn(() => Promise.resolve({ ok: true })) }));
const mockTestScale = vi.fn(() => ({
  unwrap: vi.fn(() => Promise.resolve({ value: 1, unit: "kg", stable: true })),
}));

const mockUseList = vi.fn<() => { data: DeviceProfileDto[]; isLoading: boolean }>(() => ({
  data: [printer],
  isLoading: false,
}));

vi.mock("@/features/hardware/hardware.api", () => ({
  useListDeviceProfilesQuery: () => mockUseList(),
  useCreateDeviceProfileMutation: () => [mockCreate, { isLoading: false }],
  useUpdateDeviceProfileMutation: () => [mockUpdate, { isLoading: false }],
  useDeleteDeviceProfileMutation: () => [mockDelete, { isLoading: false }],
  useTestPrintMutation: () => [mockTestPrint, { isLoading: false }],
  useTestDrawerMutation: () => [mockTestDrawer, { isLoading: false }],
  useTestScaleMutation: () => [mockTestScale, { isLoading: false }],
  useLazyDiscoverDevicesQuery: () => [vi.fn(), { data: undefined, isFetching: false }],
}));

vi.mock("@/features/stores/api/stores.api", () => ({
  useListStoresQuery: () => ({ data: [{ id: "s1", name: "Main Store" }], isLoading: false }),
}));

vi.mock("@/lib/api/error-handler", () => ({
  showSuccess: vi.fn(),
  showApiError: vi.fn(),
}));

describe("HardwareTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseList.mockReturnValue({ data: [printer], isLoading: false });
  });

  it("lists a device with its label and transport badge", () => {
    render(<HardwareTab />);
    expect(screen.getByText("Front printer")).toBeInTheDocument();
    expect(screen.getByText("Network")).toBeInTheDocument();
  });

  it("tests a printer with its (transport-aware) connection", async () => {
    render(<HardwareTab />);
    await userEvent.click(screen.getByRole("button", { name: "Test Front printer" }));
    await waitFor(() =>
      expect(mockTestPrint).toHaveBeenCalledWith({
        connection: { kind: "network", ip: "192.168.1.50", port: 9100 },
      }),
    );
  });

  it("deletes a device", async () => {
    render(<HardwareTab />);
    await userEvent.click(screen.getByRole("button", { name: "Delete Front printer" }));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith({ id: "d1" }));
  });

  it("adds a new network device", async () => {
    mockUseList.mockReturnValue({ data: [], isLoading: false });
    render(<HardwareTab />);
    await userEvent.click(screen.getByRole("button", { name: "Add device" }));
    await userEvent.type(screen.getByLabelText("Label"), "New Printer");
    await userEvent.type(screen.getByLabelText("IP address"), "10.0.0.9");
    await userEvent.click(screen.getByRole("button", { name: "Create device" }));
    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          label: "New Printer",
          kind: "printer",
          storeId: "s1",
          connection: { kind: "network", ip: "10.0.0.9", port: 9100 },
        }),
      ),
    );
  });
});
