/* eslint-disable @typescript-eslint/no-unused-expressions */
/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { cloneElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Check, ChevronRight } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
export type DropdownItemType = "item" | "divider" | "header";

export interface DropdownMenuItem {
  type?: DropdownItemType;
  label?: string;
  description?: string;
  icon?: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  destructive?: boolean;
  checked?: boolean;
  onClick?: () => void;
  children?: DropdownMenuItem[];
}

export interface DropdownMenuProps {
  trigger: React.ReactElement;
  items: DropdownMenuItem[];
  /** Align menu start/end with trigger start/end. Default: 'start'. */
  align?: "start" | "end";
  /** Gap between trigger and menu in px. Default: 4. */
  sideOffset?: number;
  /** Fixed menu width in px. Default: 224. */
  width?: number;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function isNavigable(item: DropdownMenuItem): boolean {
  return (!item.type || item.type === "item") && !item.disabled;
}

// ── Sub-menu panel ─────────────────────────────────────────────────────────────
function SubMenuPanel({
  items,
  anchorEl,
  width,
  onClose,
}: {
  items: DropdownMenuItem[];
  anchorEl: HTMLElement;
  width: number;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [activeIdx, setActiveIdx] = useState(-1);
  const panelRef = useRef<HTMLDivElement>(null);

  const navigable = useMemo(
    () => items.map((item, i) => ({ item, i })).filter(({ item }) => isNavigable(item)),
    [items],
  );

  // Mount + position
  useEffect(() => {
    setMounted(true);
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setVisible(true);
        const rect = anchorEl.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const mh = panelRef.current?.offsetHeight ?? items.length * 36 + 16;

        let left = rect.right + 4;
        if (left + width > vw - 8) left = rect.left - width - 4;

        let top = rect.top;
        if (top + mh > vh - 8) top = Math.max(8, vh - mh - 8);

        setPos({ top, left });
      }),
    );
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard nav within sub-menu
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setActiveIdx((i) => (i < navigable.length - 1 ? i + 1 : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setActiveIdx((i) => (i > 0 ? i - 1 : navigable.length - 1));
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        if (activeIdx >= 0) {
          navigable[activeIdx]?.item.onClick?.();
          onClose();
        }
      } else if (e.key === "ArrowLeft" || e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [activeIdx, navigable, onClose]);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      style={{ top: pos.top, left: pos.left, width, zIndex: 601 }}
      className={clsx(
        "fixed py-1 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl shadow-lg",
        "transition-all duration-150 ease-out origin-top-left",
        visible ? "opacity-100 scale-100 translate-x-0" : "opacity-0 scale-[0.97] -translate-x-1",
      )}
    >
      {items.map((item, idx) => (
        <MenuItemRow
          key={idx}
          item={item}
          isActive={navigable.findIndex((n) => n.i === idx) === activeIdx}
          hasSubMenu={false}
          isSubMenuOpen={false}
          onMouseEnter={() => {
            const ni = navigable.findIndex((n) => n.i === idx);
            if (ni >= 0) setActiveIdx(ni);
          }}
          onMouseLeave={() => setActiveIdx(-1)}
          onClick={() => {
            item.onClick?.();
            onClose();
          }}
          onOpenSubMenu={() => {}}
        />
      ))}
    </div>,
    document.body,
  );
}

// ── Single menu row ────────────────────────────────────────────────────────────
function MenuItemRow({
  item,
  isActive,
  hasSubMenu,
  isSubMenuOpen,
  onClick,
  onMouseEnter,
  onMouseLeave,
  onOpenSubMenu,
}: {
  item: DropdownMenuItem;
  isActive: boolean;
  hasSubMenu: boolean;
  isSubMenuOpen: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onOpenSubMenu: () => void;
}) {
  if (item.type === "divider") {
    return <div role="separator" className="my-1 h-px bg-slate-100 dark:bg-slate-800 mx-1" />;
  }

  if (item.type === "header") {
    return (
      <div
        role="presentation"
        className="px-3 pt-2 pb-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider"
      >
        {item.label}
      </div>
    );
  }

  return (
    <button
      type="button"
      role="menuitem"
      disabled={item.disabled}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onMouseMove={hasSubMenu ? onOpenSubMenu : undefined}
      className={clsx(
        "w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left",
        "transition-colors duration-100 outline-none",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        item.destructive
          ? isActive
            ? "text-error-600 bg-error-50 dark:text-error-300 dark:bg-error-500/15"
            : "text-error-600 hover:bg-error-50 dark:text-error-300 dark:hover:bg-error-500/15"
          : isActive
            ? "text-slate-900 bg-slate-100 dark:text-slate-100 dark:bg-slate-800"
            : "text-slate-700 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100",
      )}
    >
      {item.icon && (
        <span
          className={clsx(
            "flex-shrink-0 flex items-center justify-center h-4 w-4",
            item.destructive ? "text-error-500" : "text-slate-400",
            isActive && !item.destructive && "text-slate-600",
          )}
        >
          {item.icon}
        </span>
      )}

      <span className="flex-1 min-w-0">
        <span className="block truncate font-medium">{item.label}</span>
        {item.description && (
          <span className="block truncate text-xs text-slate-400 font-normal mt-px">
            {item.description}
          </span>
        )}
      </span>

      {item.checked && (
        <Check className="h-3.5 w-3.5 text-primary-500 flex-shrink-0" strokeWidth={2.5} />
      )}

      {item.shortcut && (
        <kbd className="flex-shrink-0 text-[10px] font-medium text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
          {item.shortcut}
        </kbd>
      )}

      {hasSubMenu && (
        <ChevronRight
          className={clsx(
            "h-3.5 w-3.5 flex-shrink-0 text-slate-400 transition-transform duration-150",
            isSubMenuOpen && "translate-x-0.5",
          )}
          strokeWidth={2}
        />
      )}
    </button>
  );
}

// ── Main DropdownMenu component ────────────────────────────────────────────────
export function DropdownMenu({
  trigger,
  items,
  align = "start",
  sideOffset = 4,
  width = 224,
  onOpenChange,
  className,
}: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [activeIdx, setActiveIdx] = useState(-1);
  const [openSubIdx, setOpenSubIdx] = useState<number | null>(null);
  const [subAnchor, setSubAnchor] = useState<HTMLElement | null>(null);

  const wrapperRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const subHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navigable = useMemo(
    () => items.map((item, i) => ({ item, i })).filter(({ item }) => isNavigable(item)),
    [items],
  );

  const navIndexOf = useCallback(
    (origIdx: number) => navigable.findIndex((n) => n.i === origIdx),
    [navigable],
  );

  function open() {
    setIsOpen(true);
    setActiveIdx(-1);
    setOpenSubIdx(null);
    onOpenChange?.(true);
  }

  const close = useCallback(() => {
    setVisible(false);
    setActiveIdx(-1);
    setOpenSubIdx(null);
    setTimeout(() => {
      setMounted(false);
      setIsOpen(false);
    }, 160);
    onOpenChange?.(false);
  }, [onOpenChange]);

  function toggle() {
    isOpen ? close() : open();
  }

  // Mount + animate on open
  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      return () => cancelAnimationFrame(raf);
    }
  }, [isOpen]);

  // Calculate position after mount
  useEffect(() => {
    if (!mounted || !wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const mh = menuRef.current?.offsetHeight ?? items.length * 36 + 16;

    const spaceBelow = vh - rect.bottom - sideOffset;
    const top =
      spaceBelow >= mh || spaceBelow >= rect.top
        ? rect.bottom + sideOffset
        : rect.top - mh - sideOffset;

    let left = align === "end" ? rect.right - width : rect.left;
    left = Math.max(8, Math.min(left, vw - width - 8));

    setPos({ top, left });
  }, [mounted, align, sideOffset, width, items.length]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIdx((i) => (i < navigable.length - 1 ? i + 1 : 0));
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIdx((i) => (i > 0 ? i - 1 : navigable.length - 1));
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          if (activeIdx >= 0) {
            const { item, i } = navigable[activeIdx];
            if (item.children?.length) {
              setOpenSubIdx(i);
            } else {
              item.onClick?.();
              close();
            }
          }
          break;
        case "ArrowRight":
          e.preventDefault();
          if (activeIdx >= 0 && navigable[activeIdx].item.children?.length) {
            setOpenSubIdx(navigable[activeIdx].i);
          }
          break;
        case "Escape":
          e.preventDefault();
          close();
          break;
        case "Tab":
          close();
          break;
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, activeIdx, navigable, close]);

  // Click outside
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapperRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      close();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, close]);

  // Inject event props into trigger via cloneElement
  const triggerEl = cloneElement(trigger as React.ReactElement<Record<string, unknown>>, {
    onClick: (e: React.MouseEvent) => {
      (
        (trigger as React.ReactElement<Record<string, unknown>>).props.onClick as
          ((e: React.MouseEvent) => void) | undefined
      )?.(e);
      toggle();
    },
    "aria-haspopup": "menu",
    "aria-expanded": isOpen,
  });

  const handleItemHover = (origIdx: number, el: HTMLElement | null) => {
    const ni = navIndexOf(origIdx);
    if (ni >= 0) setActiveIdx(ni);

    if (subHoverTimer.current) clearTimeout(subHoverTimer.current);
    const item = items[origIdx];
    if (item.children?.length) {
      subHoverTimer.current = setTimeout(() => {
        setOpenSubIdx(origIdx);
        setSubAnchor(el);
      }, 180);
    } else {
      subHoverTimer.current = setTimeout(() => setOpenSubIdx(null), 180);
    }
  };

  return (
    <>
      <span ref={wrapperRef} style={{ display: "inline-flex" }}>
        {triggerEl}
      </span>

      {mounted &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-orientation="vertical"
            style={{ top: pos.top, left: pos.left, width, zIndex: 600 }}
            className={twMerge(
              clsx(
                "fixed py-1 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl shadow-lg",
                "transition-all duration-150 ease-out origin-top",
                visible
                  ? "opacity-100 scale-100 translate-y-0"
                  : "opacity-0 scale-[0.97] -translate-y-1",
                className,
              ),
            )}
          >
            {items.map((item, idx) => {
              const ni = navIndexOf(idx);
              const isItemActive = ni >= 0 && ni === activeIdx;
              const hasSubMenu = Boolean(item.children?.length);
              const isSubOpen = openSubIdx === idx;

              return (
                <MenuItemRow
                  key={idx}
                  item={item}
                  isActive={isItemActive}
                  hasSubMenu={hasSubMenu}
                  isSubMenuOpen={isSubOpen}
                  onMouseEnter={() =>
                    handleItemHover(
                      idx,
                      menuRef.current
                        ? (menuRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]')[ni] ??
                            null)
                        : null,
                    )
                  }
                  onMouseLeave={() => setActiveIdx(-1)}
                  onClick={() => {
                    if (!hasSubMenu) {
                      item.onClick?.();
                      close();
                    } else setOpenSubIdx(idx);
                  }}
                  onOpenSubMenu={() => setOpenSubIdx(idx)}
                />
              );
            })}
          </div>,
          document.body,
        )}

      {openSubIdx !== null && items[openSubIdx]?.children && subAnchor && (
        <SubMenuPanel
          items={items[openSubIdx].children!}
          anchorEl={subAnchor}
          width={width}
          onClose={() => {
            setOpenSubIdx(null);
            setSubAnchor(null);
          }}
        />
      )}
    </>
  );
}
