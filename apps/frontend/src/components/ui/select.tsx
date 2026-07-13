"use client";

import { useCallback, useState, useRef, useEffect, useMemo, useId } from "react";
import { createPortal } from "react-dom";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { ChevronDown, X, Check, Search } from "lucide-react";

interface TriggerRect {
  top: number;
  left: number;
  width: number;
  bottom: number;
  spaceBelow: number;
  spaceAbove: number;
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectGroup {
  label: string;
  options: SelectOption[];
}

export interface SelectProps {
  /** Flat list of options (use either options or groups, not both). */
  options?: SelectOption[];
  /** Grouped options — each group renders with a heading and divider. */
  groups?: SelectGroup[];
  value?: string | string[];
  defaultValue?: string | string[];
  /**
   * Backward-compatible with native <select> onChange.
   * Receives a synthetic event with target.value set (string).
   * For multi-select, target.value is a comma-joined string.
   */
  onChange?: React.ChangeEventHandler<HTMLSelectElement>;
  /**
   * New API: receives the selected value(s) directly.
   * Prefer this over onChange for new code.
   */
  onValueChange?: (value: string | string[]) => void;
  placeholder?: string;
  /** Allow selecting multiple values. */
  multiple?: boolean;
  /** Show a search/filter input inside the dropdown. */
  searchable?: boolean;
  /** Show a clear (×) button when a value is selected. */
  clearable?: boolean;
  disabled?: boolean;
  error?: string;
  label?: string;
  helperText?: string;
  required?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  id?: string;
}

function flatOptions(options?: SelectOption[], groups?: SelectGroup[]): SelectOption[] {
  return [...(options ?? []), ...(groups?.flatMap((g) => g.options) ?? [])];
}

const sizeMap = {
  sm: {
    trigger: "h-8 px-3 text-xs rounded-md gap-1.5",
    searchInput: "h-7 px-2 text-xs",
    option: "px-3 py-1.5 text-xs",
    groupLabel: "px-3 py-1 text-[10px]",
    icon: "h-3.5 w-3.5",
    checkIcon: "h-3 w-3",
    label: "text-xs",
    helper: "text-[10px]",
  },
  md: {
    trigger: "h-9 px-3 text-sm rounded-lg gap-2",
    searchInput: "h-8 px-3 text-sm",
    option: "px-3 py-2 text-sm",
    groupLabel: "px-3 py-1.5 text-[11px]",
    icon: "h-4 w-4",
    checkIcon: "h-3.5 w-3.5",
    label: "text-sm",
    helper: "text-xs",
  },
  lg: {
    trigger: "h-11 px-4 text-base rounded-lg gap-2.5",
    searchInput: "h-9 px-3 text-base",
    option: "px-4 py-2.5 text-sm",
    groupLabel: "px-4 py-1.5 text-xs",
    icon: "h-4 w-4",
    checkIcon: "h-4 w-4",
    label: "text-sm",
    helper: "text-xs",
  },
} as const;

/** Build a minimal synthetic event that satisfies React.ChangeEventHandler<HTMLSelectElement>. */
function makeSyntheticEvent(value: string): React.ChangeEvent<HTMLSelectElement> {
  return {
    target: { value } as HTMLSelectElement,
    currentTarget: { value } as HTMLSelectElement,
    nativeEvent: new Event("change"),
    bubbles: false,
    cancelable: false,
    defaultPrevented: false,
    eventPhase: 0,
    isTrusted: false,
    preventDefault: () => {},
    isDefaultPrevented: () => false,
    stopPropagation: () => {},
    isPropagationStopped: () => false,
    persist: () => {},
    timeStamp: Date.now(),
    type: "change",
  } as unknown as React.ChangeEvent<HTMLSelectElement>;
}

export function Select({
  options,
  groups,
  value: controlledValue,
  defaultValue,
  onChange,
  onValueChange,
  placeholder = "Select…",
  multiple = false,
  searchable = false,
  clearable = false,
  disabled = false,
  error,
  label,
  helperText,
  required = false,
  size = "md",
  className,
  id: propId,
}: SelectProps) {
  const autoId = useId();
  const id = propId ?? autoId;
  const isControlled = controlledValue !== undefined;

  const emptyValue: string | string[] = multiple ? [] : "";
  const [internal, setInternal] = useState<string | string[]>(defaultValue ?? emptyValue);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  const current = isControlled ? controlledValue : internal;
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // Measured trigger position for the portalled dropdown.
  // Updated on open + on scroll/resize while open.
  const [triggerRect, setTriggerRect] = useState<TriggerRect | null>(null);
  const sz = sizeMap[size];
  const hasError = Boolean(error);

  const all = useMemo(() => flatOptions(options, groups), [options, groups]);

  const visibleOptions = useMemo(() => {
    if (!search || !options) return options;
    const q = search.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, search]);

  const visibleGroups = useMemo(() => {
    if (!groups) return undefined;
    if (!search) return groups;
    const q = search.toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        options: g.options.filter((o) => o.label.toLowerCase().includes(q)),
      }))
      .filter((g) => g.options.length > 0);
  }, [groups, search]);

  const hasOptions = (visibleOptions?.length ?? 0) > 0 || (visibleGroups?.length ?? 0) > 0;

  const hasValue = multiple ? (current as string[]).length > 0 : Boolean(current);

  const displayLabel = useMemo(() => {
    if (!hasValue) return null;
    if (multiple) {
      const selected = (current as string[])
        .map((v) => all.find((o) => o.value === v)?.label ?? v)
        .join(", ");
      return selected;
    }
    return all.find((o) => o.value === current)?.label ?? (current as string);
  }, [current, all, multiple, hasValue]);

  function commit(next: string | string[]) {
    if (!isControlled) setInternal(next);
    // New direct-value API
    onValueChange?.(next);
    // Legacy event-based API — build a synthetic event so e.target.value works
    if (onChange) {
      const value = Array.isArray(next) ? next.join(",") : next;
      onChange(makeSyntheticEvent(value));
    }
  }

  function handleOption(val: string) {
    if (multiple) {
      const vals = current as string[];
      commit(vals.includes(val) ? vals.filter((v) => v !== val) : [...vals, val]);
    } else {
      commit(val);
      close();
    }
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    commit(emptyValue);
  }

  function open() {
    if (!disabled) setIsOpen(true);
  }
  function close() {
    setIsOpen(false);
    setSearch("");
  }
  function toggle() {
    if (isOpen) close();
    else open();
  }

  const isSelected = (val: string) =>
    multiple ? (current as string[]).includes(val) : current === val;

  /* Focus search on open */
  useEffect(() => {
    if (isOpen && searchable) {
      const t = setTimeout(() => searchRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [isOpen, searchable]);

  /* Click outside — also exclude the portalled dropdown panel. */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target) || dropdownRef.current?.contains(target)) {
        return;
      }
      close();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* Measure the trigger so the portalled dropdown lines up. Recompute on
   * scroll / resize while open so a scrolling modal keeps it anchored. */
  const updateTriggerRect = useCallback(() => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setTriggerRect({
      top: r.top,
      left: r.left,
      width: r.width,
      bottom: r.bottom,
      spaceBelow: window.innerHeight - r.bottom,
      spaceAbove: r.top,
    });
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  /* Measurement is genuinely effect-bound (we need the trigger's
   * post-mount BoundingClientRect). The state writes here are
   * derived from the DOM, not from props that the render itself
   * could compute. */
  useEffect(() => {
    if (!isOpen) {
      setTriggerRect(null);
      return;
    }
    updateTriggerRect();
    window.addEventListener("scroll", updateTriggerRect, true);
    window.addEventListener("resize", updateTriggerRect);
    return () => {
      window.removeEventListener("scroll", updateTriggerRect, true);
      window.removeEventListener("resize", updateTriggerRect);
    };
  }, [isOpen, updateTriggerRect]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* Escape to close */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) close();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen]);

  /* ── Render helpers ── */
  function renderOption(opt: SelectOption) {
    const selected = isSelected(opt.value);
    return (
      <button
        key={opt.value}
        type="button"
        disabled={opt.disabled}
        onClick={() => handleOption(opt.value)}
        className={twMerge(
          clsx(
            "w-full flex items-center gap-2 text-left transition-colors duration-100",
            sz.option,
            opt.disabled && "opacity-40 cursor-not-allowed",
            selected
              ? "text-primary-600 bg-primary-50 dark:text-primary-300 dark:bg-primary-400/15"
              : "text-slate-700 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100",
          ),
        )}
      >
        {/* Checkbox for multi-select */}
        {multiple && (
          <span
            className={clsx(
              "flex-shrink-0 flex items-center justify-center h-4 w-4 rounded border transition-all duration-100",
              selected
                ? "bg-primary-500 border-primary-500"
                : "border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800",
            )}
          >
            {selected && <Check className={clsx(sz.checkIcon, "text-white")} strokeWidth={2.5} />}
          </span>
        )}

        <span className="flex-1 truncate">{opt.label}</span>

        {/* Checkmark for single-select */}
        {!multiple && selected && (
          <Check
            className={clsx(sz.checkIcon, "text-primary-500 flex-shrink-0")}
            strokeWidth={2.5}
          />
        )}
      </button>
    );
  }

  return (
    <div ref={containerRef} className={twMerge(clsx("flex flex-col gap-1.5", className))}>
      {/* Label */}
      {label && (
        <label
          htmlFor={id}
          className={clsx(sz.label, "font-medium text-slate-700 dark:text-slate-300 leading-none")}
        >
          {label}
          {required && (
            <span className="text-error-500 ml-0.5" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}

      <div className="relative">
        {/* Trigger */}
        <button
          id={id}
          ref={triggerRef}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          onClick={toggle}
          className={twMerge(
            clsx(
              "w-full flex items-center bg-white dark:bg-slate-900 border transition-all duration-150 outline-none",
              sz.trigger,
              disabled && "opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-800",
              hasError
                ? ["border-error-400", isOpen && "ring-2 ring-error-500/10"]
                : [
                    "border-slate-200 dark:border-slate-700",
                    !disabled && "hover:border-slate-300 dark:hover:border-slate-600",
                    isOpen
                      ? "border-primary-400 ring-2 ring-primary-500/10"
                      : "focus-visible:border-primary-400 focus-visible:ring-2 focus-visible:ring-primary-500/10",
                  ],
            ),
          )}
        >
          <span
            className={clsx(
              "flex-1 text-left truncate",
              hasValue
                ? "text-slate-800 dark:text-slate-100"
                : "text-slate-400 dark:text-slate-500",
            )}
          >
            {hasValue ? displayLabel : placeholder}
          </span>

          <span className="flex items-center gap-1 flex-shrink-0 ml-1">
            {clearable && hasValue && !disabled && (
              <span
                role="button"
                tabIndex={-1}
                onClick={handleClear}
                className={clsx(
                  "flex items-center justify-center rounded p-0.5",
                  "text-slate-400 hover:text-slate-700 hover:bg-slate-100",
                  "transition-colors duration-100",
                )}
                aria-label="Clear selection"
              >
                <X className={sz.icon} strokeWidth={2} />
              </span>
            )}
            <ChevronDown
              className={clsx(
                sz.icon,
                "text-slate-400 transition-transform duration-200",
                isOpen && "rotate-180",
              )}
              strokeWidth={1.5}
            />
          </span>
        </button>

        {isOpen &&
          triggerRect &&
          typeof window !== "undefined" &&
          createPortal(
            <div
              ref={dropdownRef}
              role="listbox"
              aria-multiselectable={multiple}
              style={(() => {
                const openUp =
                  triggerRect.spaceBelow < 224 && triggerRect.spaceAbove > triggerRect.spaceBelow;
                return {
                  position: "fixed",
                  left: triggerRect.left,
                  width: triggerRect.width,
                  ...(openUp
                    ? { bottom: window.innerHeight - triggerRect.top + 6 }
                    : { top: triggerRect.bottom + 6 }),
                  zIndex: 9999,
                };
              })()}
              className={clsx(
                "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg",
                "shadow-lg overflow-visible",
                "animate-scale-in origin-top",
              )}
            >
              {/* Search */}
              {searchable && (
                <div className="p-1.5 border-b border-slate-100 dark:border-slate-800">
                  <div
                    className={clsx(
                      "flex items-center gap-1.5 px-2 rounded-md bg-slate-50 dark:bg-slate-800",
                      "border border-slate-200 dark:border-slate-700",
                      "focus-within:border-primary-400 focus-within:ring-1 focus-within:ring-primary-500/10",
                      "transition-all duration-150",
                    )}
                  >
                    <Search
                      className={clsx(sz.icon, "text-slate-400 flex-shrink-0")}
                      strokeWidth={2}
                      aria-hidden="true"
                    />
                    <input
                      ref={searchRef}
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search…"
                      className={clsx(
                        sz.searchInput,
                        "flex-1 bg-transparent outline-none text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500",
                      )}
                    />
                    {search && (
                      <button
                        type="button"
                        onClick={() => setSearch("")}
                        className="text-slate-400 hover:text-slate-600 transition-colors"
                        aria-label="Clear search"
                      >
                        <X className="h-3 w-3" strokeWidth={2} />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Options list */}
              <div className="max-h-56 overflow-y-auto py-1">
                {/* Flat options */}
                {visibleOptions?.map(renderOption)}

                {/* Grouped options */}
                {visibleGroups?.map((group, idx) => (
                  <div key={group.label}>
                    {(idx > 0 || (visibleOptions?.length ?? 0) > 0) && (
                      <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                    )}
                    <div
                      className={clsx(
                        sz.groupLabel,
                        "font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider",
                      )}
                      role="group"
                      aria-label={group.label}
                    >
                      {group.label}
                    </div>
                    {group.options.map(renderOption)}
                  </div>
                ))}

                {/* Empty state */}
                {!hasOptions && (
                  <div className="px-3 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
                    {search ? 'No results for \"' + search + '\"' : "No options available"}
                  </div>
                )}
              </div>

              {/* Multi-select footer */}
              {multiple && hasValue && (
                <div className="border-t border-slate-100 dark:border-slate-800 px-3 py-2 flex items-center justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {(current as string[]).length} selected
                  </span>
                  <button
                    type="button"
                    onClick={() => commit([])}
                    className="text-xs text-primary-500 hover:text-primary-600 font-medium transition-colors duration-100"
                  >
                    Clear all
                  </button>
                </div>
              )}
            </div>,
            document.body,
          )}
      </div>

      {/* Helper / error */}
      {(hasError || helperText) && (
        <p
          className={clsx(
            sz.helper,
            "leading-none",
            hasError ? "text-error-600 dark:text-error-400" : "text-slate-500 dark:text-slate-400",
          )}
        >
          {error ?? helperText}
        </p>
      )}
    </div>
  );
}
