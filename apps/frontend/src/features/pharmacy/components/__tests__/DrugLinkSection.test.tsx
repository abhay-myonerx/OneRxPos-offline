import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { DrugProductDto } from "../../drug.api";

const drug: DrugProductDto = {
  din: "02248011",
  brandName: "Tylenol #3",
  company: "Janssen",
  form: "Tablet",
  route: "Oral",
  activeIngredients: [{ name: "Codeine", strength: "30mg" }],
  scheduleClass: "Narcotic (CDSA)",
  scheduleCategory: "NARCOTIC",
  status: "marketed",
  npn: null,
};

const linkSpy = vi.fn(() => ({ unwrap: () => Promise.resolve({ id: "p1", din: drug.din }) }));
const overrideSpy = vi.fn(() => ({ unwrap: () => Promise.resolve({ id: "p1", scheduleOverride: null }) }));
const searchTrigger = vi.fn();

let searchResult: { data: DrugProductDto[] | undefined; isFetching: boolean } = { data: [drug], isFetching: false };
let linkedResult: { data: DrugProductDto | undefined } = { data: undefined };

vi.mock("../../drug.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../drug.api")>();
  return {
    ...actual,
    useLazySearchDrugProductsQuery: () => [searchTrigger, searchResult],
    useGetDrugProductQuery: () => linkedResult,
    useLinkProductDrugMutation: () => [linkSpy, { isLoading: false }],
    useSetScheduleOverrideMutation: () => [overrideSpy, { isLoading: false }],
  };
});

import { DrugLinkSection } from "../DrugLinkSection";

describe("DrugLinkSection", () => {
  it("searches and links a drug when none is linked", () => {
    searchResult = { data: [drug], isFetching: false };
    linkedResult = { data: undefined };
    render(<DrugLinkSection productId="p1" din={null} scheduleOverride={null} />);
    // search result shows the drug + its schedule
    expect(screen.getByText(/Tylenol #3/)).toBeInTheDocument();
    expect(screen.getByText("Narcotic / Controlled")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Link/ }));
    expect(linkSpy).toHaveBeenCalledWith({ id: "p1", din: "02248011" });
  });

  it("shows the linked drug + schedule and can unlink", () => {
    searchResult = { data: undefined, isFetching: false };
    linkedResult = { data: drug };
    render(<DrugLinkSection productId="p1" din="02248011" scheduleOverride={null} />);
    expect(screen.getByText(/Tylenol #3/)).toBeInTheDocument();
    expect(screen.getByText(/Codeine 30mg/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Unlink/ }));
    expect(linkSpy).toHaveBeenCalledWith({ id: "p1", din: null });
  });
});
