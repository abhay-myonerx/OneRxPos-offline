import type { RouteObject } from "react-router-dom";
import { Navigate } from "react-router-dom";
import SetupPage from "@/app/setup/page";

// `src/app/page.tsx` and `src/app/(auth)/page.tsx` both derive to `/` (route
// groups are stripped) and both redirect to /login — dedupe to one route here.
export const setupRoutes: RouteObject[] = [
  { path: "/", element: <Navigate to="/login" replace /> },
  { path: "/setup", element: <SetupPage /> },
];
