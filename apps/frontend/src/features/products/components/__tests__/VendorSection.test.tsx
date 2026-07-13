import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ProductVendor } from "../../types/product.types";

const addSpy = vi.fn(() => ({ unwrap: () => Promise.resolve({ id: "ps1" }) }));
const removeSpy = vi.fn(() => ({ unwrap: () => Promise.resolve() }));
const preferSpy = vi.fn(() => ({ unwrap: () => Promise.resolve() }));

let vendors: ProductVendor[] = [];

vi.mock("../../api/products.api", () => ({
  useGetProductVendorsQuery: () => ({ data: vendors }),
  useAddProductVendorMutation: () => [addSpy, { isLoading: false }],
  useRemoveProductVendorMutation: () => [removeSpy, { isLoading: false }],
  useSetPreferredVendorMutation: () => [preferSpy, { isLoading: false }],
}));
vi.mock("@/features/suppliers/api/suppliers.api", () => ({
  useListSuppliersQuery: () => ({
    data: { data: [{ id: "s1", name: "Acme" }, { id: "s2", name: "Globex" }] },
  }),
}));
vi.mock("@/lib/api/error-handler", () => ({ showApiError: vi.fn(), showSuccess: vi.fn() }));

import { VendorSection } from "../VendorSection";

function vendor(over: Partial<ProductVendor>): ProductVendor {
  return {
    id: "v1",
    productId: "p1",
    supplierId: "s1",
    supplierSku: null,
    costPrice: 5,
    leadTimeDays: null,
    minOrderQty: null,
    reorderQty: null,
    isPreferred: false,
    autoEmail: null,
    isActive: true,
    ...over,
  };
}

beforeEach(() => {
  vendors = [];
  vi.clearAllMocks();
});

describe("VendorSection", () => {
  it("shows an empty state when no vendors are linked", () => {
    render(<VendorSection productId="p1" />);
    expect(screen.getByText(/No vendors linked/i)).toBeInTheDocument();
  });

  it("renders vendor rows with preferred + cheapest badges", () => {
    vendors = [
      vendor({ id: "v1", supplierId: "s1", costPrice: 5, isPreferred: true }),
      vendor({ id: "v2", supplierId: "s2", costPrice: 3, isCheapest: true }),
    ];
    render(<VendorSection productId="p1" />);
    // "Acme"/"Globex" also appear as <option>s in the supplier picker.
    expect(screen.getAllByText("Acme").length).toBeGreaterThan(0);
    expect(screen.getByText("Preferred")).toBeInTheDocument();
    expect(screen.getByText("Cheapest")).toBeInTheDocument();
  });

  it("adds a vendor from the form", () => {
    render(<VendorSection productId="p1" />);
    fireEvent.change(screen.getByLabelText("Supplier"), { target: { value: "s1" } });
    fireEvent.change(screen.getByLabelText("Cost"), { target: { value: "4.25" } });
    fireEvent.click(screen.getByRole("button", { name: /Add vendor/i }));
    expect(addSpy).toHaveBeenCalledWith({
      productId: "p1",
      data: { supplierId: "s1", costPrice: 4.25, supplierSku: null, reorderQty: null },
    });
  });

  it("sets a preferred vendor", () => {
    vendors = [vendor({ id: "v2", supplierId: "s2", costPrice: 3 })];
    render(<VendorSection productId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: /Set preferred/i }));
    expect(preferSpy).toHaveBeenCalledWith({ productId: "p1", supplierId: "s2" });
  });
});
