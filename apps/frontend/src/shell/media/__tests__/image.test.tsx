import { render, screen } from "@testing-library/react";
import { Image } from "@/shell/media"; // Vitest alias -> media.router.tsx

test("router Image renders a plain img with src+alt", () => {
  render(<Image src="/logo.png" alt="RX POS" width={40} height={40} />);
  const img = screen.getByAltText("RX POS");
  expect(img.tagName).toBe("IMG");
  expect(img).toHaveAttribute("src", "/logo.png");
});
