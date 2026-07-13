"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "@/shell/nav";
import {
  Search,
  LayoutDashboard,
  ShoppingCart,
  Package,
  FolderTree,
  Boxes,
  Receipt,
  Users,
  Truck,
  ShoppingBag,
  Wallet,
  BarChart3,
  UserCog,
  Store,
  Settings,
  Printer,
  ShieldAlert,
  CornerDownLeft,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useAppSelector } from "@/store/hooks";
import { ROUTES } from "@/constants/routes";
import { Role } from "@/types/enums/role.enums";
import { PERMISSIONS_V2, type PermissionV2 } from "@/lib/permissions/permissions-v2";
import { hasAnyPermission } from "@/lib/permissions/has-permission";

type SearchItem = {
  label: string;
  description: string;
  path: string;
  group: "Pages" | "Settings" | "Admin";
  keywords: string[];
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  /** User must have at least one of these permissions to see this item. */
  anyOf?: PermissionV2[];
};

const SEARCH_INDEX: SearchItem[] = [
  {
    label: "Dashboard",
    description: "Overview of revenue, orders and key metrics",
    path: ROUTES.DASHBOARD,
    group: "Pages",
    keywords: ["home", "overview", "kpi", "stats", "metrics"],
    icon: LayoutDashboard,
  },
  {
    label: "Point of Sale",
    description: "Run a checkout and process sales",
    path: ROUTES.POS,
    group: "Pages",
    keywords: ["pos", "checkout", "register", "cashier", "sell"],
    icon: ShoppingCart,
    anyOf: [PERMISSIONS_V2.POS_ACCESS, PERMISSIONS_V2.SALES_CREATE],
  },
  {
    label: "Products",
    description: "Manage products, prices and SKUs",
    path: ROUTES.PRODUCTS,
    group: "Pages",
    keywords: ["items", "catalog", "sku", "barcode", "stock"],
    icon: Package,
    anyOf: [PERMISSIONS_V2.PRODUCTS_READ],
  },
  {
    label: "Categories",
    description: "Group products into categories",
    path: ROUTES.CATEGORIES,
    group: "Pages",
    keywords: ["category", "tags", "groups", "sections"],
    icon: FolderTree,
    anyOf: [PERMISSIONS_V2.CATEGORIES_READ, PERMISSIONS_V2.CATEGORIES_MANAGE],
  },
  {
    label: "Inventory",
    description: "Track stock levels and movements",
    path: ROUTES.INVENTORY,
    group: "Pages",
    keywords: ["stock", "warehouse", "quantity", "transfer"],
    icon: Boxes,
    anyOf: [PERMISSIONS_V2.INVENTORY_READ],
  },
  {
    label: "Sales",
    description: "View past sales and invoices",
    path: ROUTES.SALES,
    group: "Pages",
    keywords: ["orders", "invoices", "transactions", "history"],
    icon: Receipt,
    anyOf: [PERMISSIONS_V2.SALES_READ],
  },
  {
    label: "Customers",
    description: "Customer profiles and purchase history",
    path: ROUTES.CUSTOMERS,
    group: "Pages",
    keywords: ["clients", "buyers", "contacts", "loyalty"],
    icon: Users,
    anyOf: [PERMISSIONS_V2.CUSTOMERS_READ],
  },
  {
    label: "Suppliers",
    description: "Vendor and supplier directory",
    path: ROUTES.SUPPLIERS,
    group: "Pages",
    keywords: ["vendors", "wholesalers", "providers"],
    icon: Truck,
    anyOf: [PERMISSIONS_V2.SUPPLIERS_READ],
  },
  {
    label: "Purchases",
    description: "Purchase orders and receiving",
    path: ROUTES.PURCHASES,
    group: "Pages",
    keywords: ["po", "purchase orders", "receiving", "buying"],
    icon: ShoppingBag,
    anyOf: [PERMISSIONS_V2.PURCHASES_READ],
  },
  {
    label: "Expenses",
    description: "Track operating expenses and bills",
    path: ROUTES.EXPENSES,
    group: "Pages",
    keywords: ["bills", "costs", "spending", "operating"],
    icon: Wallet,
    anyOf: [PERMISSIONS_V2.EXPENSES_READ],
  },
  {
    label: "Reports",
    description: "Analytics, charts and exports",
    path: ROUTES.REPORTS,
    group: "Pages",
    keywords: ["analytics", "charts", "export", "insights", "kpi"],
    icon: BarChart3,
    anyOf: [
      PERMISSIONS_V2.REPORTS_SALES_READ,
      PERMISSIONS_V2.REPORTS_PROFIT_READ,
      PERMISSIONS_V2.REPORTS_STOCK_READ,
      PERMISSIONS_V2.REPORTS_PURCHASES_READ,
      PERMISSIONS_V2.REPORTS_EXPENSES_READ,
    ],
  },
  {
    label: "Users",
    description: "Manage staff accounts and permissions",
    path: ROUTES.USERS,
    group: "Settings",
    keywords: ["staff", "team", "employees", "roles", "permissions"],
    icon: UserCog,
    anyOf: [PERMISSIONS_V2.USERS_READ, PERMISSIONS_V2.USERS_CREATE, PERMISSIONS_V2.USERS_UPDATE],
  },
  {
    label: "Stores",
    description: "Manage store locations and devices",
    path: ROUTES.STORES,
    group: "Settings",
    keywords: ["locations", "branches", "outlets", "shops"],
    icon: Store,
    anyOf: [PERMISSIONS_V2.STORES_READ, PERMISSIONS_V2.STORES_UPDATE],
  },
  {
    label: "Settings",
    description: "App preferences and account settings",
    path: ROUTES.SETTINGS,
    group: "Settings",
    keywords: ["preferences", "account", "config", "profile"],
    icon: Settings,
    anyOf: [PERMISSIONS_V2.TENANT_SETTINGS_UPDATE],
  },
  {
    label: "Receipt Settings",
    description: "Customize printed receipts",
    path: ROUTES.RECEIPT_SETTINGS,
    group: "Settings",
    keywords: ["print", "invoice", "header", "footer", "logo"],
    icon: Printer,
    anyOf: [PERMISSIONS_V2.RECEIPTS_TEMPLATE_READ, PERMISSIONS_V2.RECEIPTS_TEMPLATE_UPDATE],
  },
  {
    label: "Tenant Management",
    description: "Manage all tenants on the platform",
    path: ROUTES.ADMIN_TENANTS,
    group: "Admin",
    keywords: ["tenants", "organizations", "saas", "platform"],
    icon: ShieldAlert,
    adminOnly: true,
  },
];

function highlight(text: string, query: string) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-primary-100 dark:bg-primary-400/25 text-primary-700 dark:text-primary-300 rounded-sm px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

/**
 * Client-side global search over a static page index filtered by the user's
 * permissions. Typing triggers a 300 ms debounce before the results compute;
 * results are ranked by a simple scoring heuristic (label-prefix > label-match >
 * keyword-match > description-match). Navigation supports ↑/↓ arrow keys and
 * Enter to open. Esc dismisses and blurs the input.
 */
export function GlobalSearch() {
  const navigate = useNavigate();
  const user = useAppSelector((s) => s.auth.user);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [prevDebouncedQuery, setPrevDebouncedQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce search: short queries clear instantly; 2+ chars wait 300 ms so
  // we're not re-scoring the whole index on every keystroke.
  useEffect(() => {
    const t = setTimeout(
      () => setDebouncedQuery(query.length < 2 ? "" : query),
      query.length < 2 ? 0 : 300,
    );
    return () => clearTimeout(t);
  }, [query]);

  const isSearching = query !== debouncedQuery && query.length >= 2;

  // Score-ranked, permission-filtered results. Max 8 shown to keep the
  // dropdown scannable; the scoring tiers prefer label prefix-matches so
  // typing "pos" surfaces "Point of Sale" before "Expenses" (keyword match).
  const results = useMemo(() => {
    if (debouncedQuery.length < 2) return [];
    const q = debouncedQuery.toLowerCase();
    const isAdmin = user?.role === Role.SUPER_ADMIN;
    const scored = SEARCH_INDEX.flatMap((item) => {
      if (item.adminOnly && !isAdmin) return [];
      // Permission gate — prevents non-privileged roles seeing pages they can't reach.
      if (item.anyOf?.length && !hasAnyPermission(user, ...item.anyOf)) return [];
      const label = item.label.toLowerCase();
      const desc = item.description.toLowerCase();
      let score = 0;
      if (label.startsWith(q)) score = 100;
      else if (label.includes(q)) score = 75;
      else if (item.keywords.some((k) => k.toLowerCase().includes(q))) score = 50;
      else if (desc.includes(q)) score = 25;
      return score > 0 ? [{ item, score }] : [];
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 8).map((s) => s.item);
  }, [debouncedQuery, user]);

  const grouped = useMemo(() => {
    const order: Array<SearchItem["group"]> = ["Pages", "Settings", "Admin"];
    const map = new Map<SearchItem["group"], SearchItem[]>();
    for (const item of results) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return order.filter((g) => map.has(g)).map((g) => ({ group: g, items: map.get(g)! }));
  }, [results]);

  // Reset the keyboard-focused row whenever the result set changes.
  // Using the React 19 "derived state during render" pattern avoids an
  // extra `useEffect` that would trigger a second render unnecessarily.
  if (prevDebouncedQuery !== debouncedQuery) {
    setPrevDebouncedQuery(debouncedQuery);
    setFocusedIdx(0);
  }

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const navigateTo = (path: string) => {
    setOpen(false);
    setQuery("");
    setDebouncedQuery("");
    inputRef.current?.blur();
    navigate(path);
  };

  const handleInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[focusedIdx];
      if (item) navigateTo(item.path);
    }
  };

  const showDropdown = open && debouncedQuery.length >= 2;
  const flatIndex = (group: SearchItem["group"], idxInGroup: number) => {
    let count = 0;
    for (const g of grouped) {
      if (g.group === group) return count + idxInGroup;
      count += g.items.length;
    }
    return -1;
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-full hidden sm:block transition-all duration-200",
        focused ? "max-w-lg" : "max-w-md",
      )}
    >
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500 pointer-events-none z-10" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          setFocused(true);
          setOpen(true);
        }}
        onBlur={() => setFocused(false)}
        onKeyDown={handleInputKey}
        placeholder="Search pages, products, settings..."
        aria-label="Global search"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls="global-search-results"
        autoComplete="off"
        spellCheck={false}
        className="h-10 w-full rounded-lg bg-slate-100/80 dark:bg-slate-800 border-0 pl-10 pr-9 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:bg-white dark:focus:bg-slate-800 transition-all"
      />

      {(isSearching || query.length > 0) && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10">
          {isSearching ? (
            <span
              className="block h-4 w-4 rounded-full border-2 border-slate-300 dark:border-slate-600 border-t-primary-500 animate-spin"
              aria-label="Searching"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setDebouncedQuery("");
                inputRef.current?.focus();
              }}
              className="h-5 w-5 rounded-md flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {showDropdown && (
        <div
          id="global-search-results"
          role="listbox"
          className="absolute top-12 left-0 right-0 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50 py-2 max-h-[420px] overflow-y-auto animate-scale-in z-40"
        >
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Search className="h-6 w-6 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                No results found
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                Try searching for products, sales, or settings
              </p>
            </div>
          ) : (
            <>
              {grouped.map(({ group, items }) => (
                <div key={group} className="mb-1 last:mb-0">
                  <div className="px-4 pt-2 pb-1">
                    <p className="text-[10px] font-medium uppercase tracking-widest text-slate-400 dark:text-slate-500">
                      {group}
                    </p>
                  </div>
                  <ul>
                    {items.map((item, idxInGroup) => {
                      const flatIdx = flatIndex(group, idxInGroup);
                      const isFocused = flatIdx === focusedIdx;
                      const Icon = item.icon;
                      return (
                        <li key={item.path}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={isFocused}
                            onMouseEnter={() => setFocusedIdx(flatIdx)}
                            onMouseDown={(e) => {
                              e.preventDefault();
                            }}
                            onClick={() => navigateTo(item.path)}
                            className={cn(
                              "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                              isFocused
                                ? "bg-primary-50/70 dark:bg-primary-400/15"
                                : "hover:bg-slate-50 dark:hover:bg-slate-800/50",
                            )}
                          >
                            <span
                              className={cn(
                                "h-9 w-9 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                                isFocused
                                  ? "bg-primary-100 dark:bg-primary-400/25 text-primary-600 dark:text-primary-300"
                                  : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400",
                              )}
                            >
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                                {highlight(item.label, debouncedQuery)}
                              </span>
                              <span className="block text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                {item.description}
                              </span>
                            </span>
                            {isFocused && (
                              <CornerDownLeft className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}

              <div className="border-t border-slate-100 dark:border-slate-800 mt-1 px-4 py-2 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500">
                <span className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono">
                      ↑
                    </kbd>
                    <kbd className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono">
                      ↓
                    </kbd>
                    navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono">
                      ↵
                    </kbd>
                    open
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono">
                      esc
                    </kbd>
                    close
                  </span>
                </span>
                <span>
                  {results.length} result{results.length === 1 ? "" : "s"}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
