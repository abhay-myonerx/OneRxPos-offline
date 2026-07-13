import type { AnchorHTMLAttributes, ReactNode } from "react";

export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  href: string;
  replace?: boolean;
  children: ReactNode;
}
export interface NavigateProps {
  to: string;
  replace?: boolean;
}
export type NavigateFn = (href: string, opts?: { replace?: boolean; scroll?: boolean }) => void;
