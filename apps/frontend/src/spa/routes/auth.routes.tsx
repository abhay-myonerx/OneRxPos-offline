import type { RouteObject } from "react-router-dom";
import AuthLayout from "@/app/(auth)/layout";
import LoginPage from "@/app/(auth)/login/page";
import RegisterPage from "@/app/(auth)/register/page";
import { layoutRoute } from "./layoutRoute";

const AuthLayoutRoute = layoutRoute(AuthLayout);

export const authRoutes: RouteObject[] = [
  {
    element: <AuthLayoutRoute />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/register", element: <RegisterPage /> },
    ],
  },
];
