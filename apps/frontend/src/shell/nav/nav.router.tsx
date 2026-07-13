// SPA (Vite/React Router) shell: implements the @/shell/nav surface on top of
// react-router-dom. See vite.config.ts alias and src/shell/nav/index.tsx (Next impl).
import {
  Link as RouterLink,
  Navigate as RouterNavigate,
  useLocation,
  useNavigate as useRouterNavigate,
  useParams as useRouterParams,
  useSearchParams as useRouterSearchParams,
} from "react-router-dom";
import type { LinkProps, NavigateFn, NavigateProps } from "./types";

export function Link({ href, replace, children, ...rest }: LinkProps) {
  return (
    <RouterLink to={href} replace={replace} {...rest}>
      {children}
    </RouterLink>
  );
}

export function useNavigate(): NavigateFn {
  const navigate = useRouterNavigate();
  // why: `scroll` is a Next-only concern (see index.tsx) — react-router never
  // auto-scrolls on navigate, so there's nothing to pass through here.
  return (href, opts) => navigate(href, { replace: opts?.replace });
}

export function usePathname(): string {
  return useLocation().pathname;
}

export function useParams<T extends Record<string, string> = Record<string, string>>(): T {
  return useRouterParams() as T;
}

export function useSearchParams(): [URLSearchParams, (next: URLSearchParams) => void] {
  const [params, setParams] = useRouterSearchParams();
  return [params, (next) => setParams(next)];
}

export function Navigate({ to, replace }: NavigateProps) {
  return <RouterNavigate to={to} replace={replace} />;
}
