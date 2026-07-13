"use client";

import { Link, usePathname } from "@/shell/nav";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils/cn";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export function EssMobileNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  // Only show first 5 items in mobile bar — the rest are accessible via dashboard.
  const visible = items.slice(0, 5);

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm"
      aria-label="ESS quick navigation"
    >
      <ul className="grid grid-cols-5">
        {visible.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href || (item.href !== "/me" && pathname.startsWith(item.href));
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-2 text-[11px]",
                  active
                    ? "text-[#4263eb] dark:text-primary-300"
                    : "text-slate-400 dark:text-slate-500",
                )}
              >
                {/* Active pill indicator above icon */}
                <span
                  className={cn(
                    "h-0.5 w-6 rounded-full mb-1 transition-all duration-150",
                    active ? "bg-[#4263eb] dark:bg-primary-400" : "bg-transparent",
                  )}
                />
                <Icon className="h-5 w-5" />
                <span className={cn(active && "font-semibold")}>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
