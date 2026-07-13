"use client";
import toast from "react-hot-toast";
import { useAuth } from "./useAuth";

const DEMO_TOAST_MSG = "This action is disabled in demo mode";
const DEMO_TOAST_ID = "demo-restricted";

export function isDemoRestricted(action: string): boolean {
  const restricted = ["delete", "create_user", "change_password", "destroy"];
  return restricted.some((r) => action.toLowerCase().includes(r));
}

export function useDemoMode() {
  const { isDemoMode } = useAuth();
  const showDemoToast = () =>
    toast(DEMO_TOAST_MSG, { id: DEMO_TOAST_ID, icon: "🔒", duration: 3000 });
  return { isDemoMode, showDemoToast };
}

export function useDemoAction() {
  const { isDemoMode } = useAuth();
  const showDemoToast = () =>
    toast(DEMO_TOAST_MSG, { id: DEMO_TOAST_ID, icon: "🔒", duration: 3000 });
  const guardAction = (fn: () => void | Promise<void>): void => {
    if (isDemoMode) {
      showDemoToast();
      return;
    }
    void fn();
  };
  return { isDemoMode, guardAction, showDemoToast };
}
