import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProductSearchGrid, type ProductSearchGridProps } from "../ProductSearchGrid";
import { ProductType } from "@/types/enums/status.enums";
import type { Product } from "@/features/products/types/product.types";

// ── ProductSearchGrid ────────────────────────────────────────────────────────
// Presentational — all state/handlers come from useRingUp as props. Mirrors
// CartRow.test.tsx / CartTotals.test.tsx (render tests moved out of page.tsx,
// Phase 1.3a decomposition, Task 11).

const product = (over: Partial<Product> = {}): Product => ({
  id: "p1",
  tenantId: "t1",
  name: "Amoxicillin 500mg",
  slug: "amoxicillin-500mg",
  sku: "AMX-500",
  productType: ProductType.STANDARD,
  costPrice: "5.00",
  sellPrice: "12.50",
  taxCategory: "STANDARD",
  taxInclusive: false,
  isActive: true,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  storeStock: [{ storeId: "store-1", quantity: 20, lowStockThreshold: 5 }],
  ...over,
});

function renderGrid(over: Partial<ProductSearchGridProps> = {}) {
  const props: ProductSearchGridProps = {
    hasMultipleStores: false,
    storeIds: [],
    selectedStoreId: null,
    setSelectedStoreId: vi.fn(),
    search: "",
    setSearch: vi.fn(),
    scannerEnabled: false,
    setScannerEnabled: vi.fn(),
    scanLoading: false,
    socketConnected: false,
    connectedScanners: [],
    isLoading: false,
    products: [product()],
    stockCounts: { inStock: 1, outOfStock: 0, notStocked: 0, all: 1 },
    stockFilter: "in",
    setStockFilter: vi.fn(),
    effectiveStoreId: "store-1",
    visibleProducts: [product()],
    getInCartQty: () => 0,
    handleProductTileClick: vi.fn(),
    ...over,
  };
  render(<ProductSearchGrid {...props} />);
  return props;
}

describe("ProductSearchGrid", () => {
  it("renders a product tile with name, SKU, and price, and calls handleProductTileClick when tapped", async () => {
    const props = renderGrid();

    expect(screen.getByText("Amoxicillin 500mg")).toBeInTheDocument();
    expect(screen.getByText("AMX-500")).toBeInTheDocument();
    expect(screen.getByText("$12.50")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Amoxicillin 500mg"));
    expect(props.handleProductTileClick).toHaveBeenCalledWith(product());
  });

  it("shows the NoStoreEmptyState instead of the product grid when no store is selected", () => {
    renderGrid({ effectiveStoreId: null });

    expect(screen.getByText("Choose a store to sell from")).toBeInTheDocument();
    expect(screen.queryByText("Amoxicillin 500mg")).not.toBeInTheDocument();
  });

  it("shows the stock-filter pills with counts and calls setStockFilter on click", async () => {
    const props = renderGrid({
      stockCounts: { inStock: 3, outOfStock: 2, notStocked: 1, all: 6 },
    });

    expect(screen.getByText("In stock").parentElement).toHaveTextContent("3");
    await userEvent.click(screen.getByText("Out of stock"));
    expect(props.setStockFilter).toHaveBeenCalledWith("out");
  });

  it("disables an out-of-stock tile and labels it accordingly", () => {
    renderGrid({
      products: [product({ storeStock: [{ storeId: "store-1", quantity: 0, lowStockThreshold: 5 }] })],
      visibleProducts: [
        product({ storeStock: [{ storeId: "store-1", quantity: 0, lowStockThreshold: 5 }] }),
      ],
    });

    const tile = screen.getByRole("button", { name: /Amoxicillin 500mg/ });
    expect(tile).toBeDisabled();
    expect(screen.getByText("Out of stock")).toBeInTheDocument();
  });

  it("toggles the scanner button and shows the scanner status line only when enabled", () => {
    const { rerender } = render(
      <ProductSearchGrid
        {...({
          hasMultipleStores: false,
          storeIds: [],
          selectedStoreId: null,
          setSelectedStoreId: vi.fn(),
          search: "",
          setSearch: vi.fn(),
          scannerEnabled: false,
          setScannerEnabled: vi.fn(),
          scanLoading: false,
          socketConnected: false,
          connectedScanners: [],
          isLoading: false,
          products: [],
          stockCounts: { inStock: 0, outOfStock: 0, notStocked: 0, all: 0 },
          stockFilter: "in",
          setStockFilter: vi.fn(),
          effectiveStoreId: "store-1",
          visibleProducts: [],
          getInCartQty: () => 0,
          handleProductTileClick: vi.fn(),
        } satisfies ProductSearchGridProps)}
      />,
    );
    expect(screen.queryByText("Scanner ready")).not.toBeInTheDocument();

    rerender(
      <ProductSearchGrid
        {...({
          hasMultipleStores: false,
          storeIds: [],
          selectedStoreId: null,
          setSelectedStoreId: vi.fn(),
          search: "",
          setSearch: vi.fn(),
          scannerEnabled: true,
          setScannerEnabled: vi.fn(),
          scanLoading: false,
          socketConnected: false,
          connectedScanners: [],
          isLoading: false,
          products: [],
          stockCounts: { inStock: 0, outOfStock: 0, notStocked: 0, all: 0 },
          stockFilter: "in",
          setStockFilter: vi.fn(),
          effectiveStoreId: "store-1",
          visibleProducts: [],
          getInCartQty: () => 0,
          handleProductTileClick: vi.fn(),
        } satisfies ProductSearchGridProps)}
      />,
    );
    expect(screen.getByText("Scanner ready")).toBeInTheDocument();
  });
});
