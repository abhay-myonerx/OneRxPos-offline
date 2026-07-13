import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ManualBarcodeModal } from "../ManualBarcodeModal";

async function renderModal(overrides: Partial<React.ComponentProps<typeof ManualBarcodeModal>> = {}) {
  const onClose = vi.fn();
  const onSubmit = vi.fn();
  render(
    <ManualBarcodeModal open onClose={onClose} onSubmit={onSubmit} {...overrides} />,
  );
  // Modal mounts hidden then flips to visible (clearing aria-hidden) via a
  // double requestAnimationFrame — wait for that before interacting, same
  // pattern as OverrideModal's test.
  await waitFor(() => {
    expect(screen.getByRole("dialog", { hidden: true })).toHaveClass("opacity-100");
  });
  return { onClose, onSubmit };
}

describe("ManualBarcodeModal", () => {
  it("calls onSubmit with the entered barcode when submitted", async () => {
    const { onSubmit } = await renderModal();

    await userEvent.type(screen.getByRole("textbox"), "0123456789012");
    await userEvent.click(screen.getByRole("button", { name: /add/i }));

    expect(onSubmit).toHaveBeenCalledWith("0123456789012");
  });

  it("submits on Enter as well as the Add button", async () => {
    const { onSubmit } = await renderModal();

    await userEvent.type(screen.getByRole("textbox"), "999{enter}");

    expect(onSubmit).toHaveBeenCalledWith("999");
  });

  it("does not call onSubmit when the field is empty", async () => {
    const { onSubmit } = await renderModal();

    await userEvent.click(screen.getByRole("button", { name: /add/i }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does not call onSubmit for whitespace-only input", async () => {
    const { onSubmit } = await renderModal();

    await userEvent.type(screen.getByRole("textbox"), "   {enter}");

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("clears the input and closes after a successful submit", async () => {
    const { onClose } = await renderModal();

    await userEvent.type(screen.getByRole("textbox"), "barcode-1{enter}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
