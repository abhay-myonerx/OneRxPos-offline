import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { Link, useNavigate, usePathname } from "@/shell/nav"; // alias -> nav.router.tsx

function Probe() {
  const navigate = useNavigate();
  return (
    <div>
      <span data-testid="path">{usePathname()}</span>
      <Link href="/b">go-link</Link>
      <button onClick={() => navigate("/c", { replace: true })}>go-fn</button>
    </div>
  );
}

function routerAt(path: string) {
  return createMemoryRouter([{ path: "*", element: <Probe /> }], { initialEntries: [path] });
}

test("usePathname reflects the current location", () => {
  render(<RouterProvider router={routerAt("/a")} />);
  expect(screen.getByTestId("path")).toHaveTextContent("/a");
});

test("Link renders an anchor whose href is the target", () => {
  render(<RouterProvider router={routerAt("/a")} />);
  expect(screen.getByText("go-link")).toHaveAttribute("href", "/b");
});

test("useNavigate pushes a new path", async () => {
  render(<RouterProvider router={routerAt("/a")} />);
  await userEvent.click(screen.getByText("go-fn"));
  expect(screen.getByTestId("path")).toHaveTextContent("/c");
});
