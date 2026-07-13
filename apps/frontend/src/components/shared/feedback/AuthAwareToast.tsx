"use client";

import { useEffect } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "@/shell/nav";
import { useAppDispatch } from "@/store/hooks";
import { logout } from "@/store/auth.slice";
import { ROUTES } from "@/constants/routes";
import { store } from "@/store";

export function AuthAwareToast() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  useEffect(() => {
    const onExpired = () => {
      const state = store.getState() as {
        auth?: { isAuthenticated?: boolean };
      };
      if (!state.auth?.isAuthenticated) return;
      toast.error("Your session has expired. Please sign in again.", {
        id: "session-expired",
        duration: 4000,
      });
      dispatch(logout());
      navigate(ROUTES.LOGIN, { replace: true });
    };

    window.addEventListener("auth:expired", onExpired);
    return () => window.removeEventListener("auth:expired", onExpired);
  }, [navigate, dispatch]);

  return null;
}
