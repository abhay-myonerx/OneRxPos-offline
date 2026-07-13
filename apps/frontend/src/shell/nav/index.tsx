"use client";

// Next.js shell: implements the @/shell/nav surface on top of next/navigation
// and next/link. See src/shell/nav/nav.router.tsx (SPA impl) and the "@/shell/nav"
// alias in vite.config.ts, which swaps this file out under Vite/Vitest.
// "use client" is required: this module also exports client-only hooks
// (useRouter/usePathname/useParams/useSearchParams), so any Server Component
// that imports even just `Link` from here pulls in the whole module graph.
import NextLink from "next/link";
import {
  usePathname as useNextPathname,
  useParams as useNextParams,
  useRouter,
  useSearchParams as useNextSearchParams,
  redirect,
} from "next/navigation";
import { useCallback } from "react";
import type { LinkProps, NavigateFn, NavigateProps } from "./types";

export function Link({ href, replace, children, ...rest }: LinkProps) {
  return (
    <NextLink href={href} replace={replace} {...rest}>
      {children}
    </NextLink>
  );
}

export function useNavigate(): NavigateFn {
  const router = useRouter();
  return useCallback(
    (href, opts) =>
      opts?.replace
        ? router.replace(href, { scroll: opts?.scroll })
        : router.push(href, { scroll: opts?.scroll }),
    [router],
  );
}

export function usePathname(): string {
  return useNextPathname();
}

export function useParams<T extends Record<string, string> = Record<string, string>>(): T {
  return useNextParams() as T;
}

export function useSearchParams(): [URLSearchParams, (next: URLSearchParams) => void] {
  const params = useNextSearchParams();
  // Next's searchParams are read-only here; write via router navigation at call sites that need it.
  const read = new URLSearchParams(params?.toString() ?? "");
  // why: the Next shell has no programmatic search-param setter (App Router
  // reads params from the URL only) — callers that need to write params run
  // under the SPA router, which provides a real setter via nav.router.tsx.
  return [
    read,
    () => {
      /* no-op in Next shell */
    },
  ];
}

export function Navigate({ to }: NavigateProps) {
  redirect(to); // Next redirect always replaces the client history entry; `replace` is a no-op here.
  return null;
}
