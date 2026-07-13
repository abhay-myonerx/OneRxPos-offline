import "@fontsource/inter";
import "./app/globals.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";
import { routes } from "./spa/routes";

// AppProviders (which needs a router ancestor for SetupGuard) is the root
// route's element in `routes` — see src/spa/routes/index.tsx — so it renders
// inside RouterProvider, not around it.
const router = createHashRouter(routes);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
