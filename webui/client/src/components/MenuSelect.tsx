import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type MenuOption = {
  value: string;
  label: string;
};

type Box = {
  top: number;
  left: number;
  minWidth: number;
  maxHeight: number;
  up: boolean;
  sheet: boolean;
};

function phoneLayout(): boolean {
  return window.matchMedia("(max-width: 700px)").matches;
}

function visibleFrame(): { top: number; left: number; width: number; height: number } {
  const view = window.visualViewport;
  if (view) {
    return { top: view.offsetTop, left: view.offsetLeft, width: view.width, height: view.height };
  }
  return { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
}

function placeMenu(trigger: HTMLElement, searchable: boolean): Box {
  if (searchable && phoneLayout()) {
    const view = visibleFrame();
    const inset = 8;
    return {
      top: view.top + inset,
      left: view.left + inset,
      minWidth: Math.max(0, view.width - inset * 2),
      maxHeight: Math.max(160, view.height - inset * 2),
      up: false,
      sheet: true,
    };
  }
  const rect = trigger.getBoundingClientRect();
  const gap = 6;
  const below = window.innerHeight - rect.bottom - gap;
  const above = rect.top - gap;
  const up = below < 220 && above > below;
  const room = Math.max(120, up ? above : below);
  const minWidth = Math.min(Math.max(rect.width, searchable ? 260 : 224), window.innerWidth - 16);
  const maxLeft = Math.max(8, window.innerWidth - minWidth - 8);
  return {
    top: up ? rect.top - gap : rect.bottom + gap,
    left: Math.max(8, Math.min(rect.left, maxLeft)),
    minWidth,
    maxHeight: Math.min(searchable ? 420 : 256, room),
    up,
    sheet: false,
  };
}

export function MenuSelect(props: {
  label: string;
  value: string;
  options: readonly MenuOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Heading sits in a title. Field is the bordered control used in toolbars. */
  variant?: "field" | "heading";
  className?: string;
  /** Shown on the closed control when it should differ from the selected option. */
  display?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  /** These stay at the top of a searchable menu, even while filtering. */
  pinValues?: readonly string[];
}) {
  const variant = props.variant ?? "field";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [box, setBox] = useState<Box | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const menuId = useId();
  const current = props.options.find((option) => option.value === props.value);
  const shown = props.display ?? current?.label ?? props.options[0]?.label ?? "";
  const pins = new Set(props.pinValues ?? []);
  const needle = query.trim().toLowerCase();
  const pinned = props.options.filter((option) => pins.has(option.value));
  const rest = props.options.filter((option) => !pins.has(option.value));
  const filtered = needle
    ? rest.filter((option) => option.label.toLowerCase().includes(needle))
    : rest;
  const listed = props.searchable ? [...pinned, ...filtered] : props.options;

  useEffect(() => {
    if (props.disabled) setOpen(false);
  }, [props.disabled]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !props.searchable) return;
    searchRef.current?.focus();
  }, [open, props.searchable]);

  useLayoutEffect(() => {
    if (!open) return;
    const trigger = rootRef.current?.querySelector("button");
    if (!(trigger instanceof HTMLElement)) return;
    function move() {
      if (trigger instanceof HTMLElement) setBox(placeMenu(trigger, props.searchable === true));
    }
    move();
    const view = window.visualViewport;
    window.addEventListener("resize", move);
    window.addEventListener("scroll", move, true);
    view?.addEventListener("resize", move);
    view?.addEventListener("scroll", move);
    return () => {
      window.removeEventListener("resize", move);
      window.removeEventListener("scroll", move, true);
      view?.removeEventListener("resize", move);
      view?.removeEventListener("scroll", move);
    };
  }, [open, props.searchable]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  function choose(value: string) {
    setOpen(false);
    if (value !== props.value) props.onChange(value);
  }

  const menu =
    open && box
      ? createPortal(
          <>
            {box.sheet ? <div className="menu-select__backdrop" /> : null}
            <div
              ref={menuRef}
              id={menuId}
              className={["menu-select__menu", box.sheet ? "is-sheet" : "", !box.sheet && box.up ? "is-up" : "", props.searchable ? "is-search" : ""]
                .filter(Boolean)
                .join(" ")}
              role="listbox"
              aria-label={props.label}
              style={{
                top: box.top,
                left: box.left,
                width: box.sheet ? box.minWidth : undefined,
                height: box.sheet ? box.maxHeight : undefined,
                minWidth: box.minWidth,
                maxHeight: box.maxHeight,
              }}
            >
              {props.searchable ? (
                <input
                  ref={searchRef}
                  className="menu-select__search"
                  type="text"
                  inputMode="search"
                  enterKeyHint="search"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={query}
                  placeholder={props.searchPlaceholder ?? "Search"}
                  aria-label={props.searchPlaceholder ?? "Search"}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => event.stopPropagation()}
                />
              ) : null}
              <ul className="menu-select__options">
                {listed.map((option, index) => {
                  const selected = option.value === props.value;
                  const split = props.searchable && pins.has(option.value) && index === pinned.length - 1 && filtered.length > 0;
                  return (
                    <li key={`${index}:${option.value}`} className={split ? "menu-select__pin" : undefined}>
                      <button
                        type="button"
                        role="option"
                        className="menu-select__option"
                        aria-selected={selected}
                        onClick={() => choose(option.value)}
                      >
                        {option.label}
                      </button>
                    </li>
                  );
                })}
                {props.searchable && listed.length === 0 ? (
                  <li className="menu-select__empty">Nothing matches.</li>
                ) : null}
              </ul>
            </div>
          </>,
          document.body,
        )
      : null;

  return (
    <div
      ref={rootRef}
      className={["menu-select", variant === "heading" ? "menu-select--heading" : "menu-select--field", open ? "is-open" : "", props.className]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        type="button"
        className="menu-select__toggle"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={props.label}
        disabled={props.disabled}
        onClick={() => {
          if (!props.disabled) setOpen((currentOpen) => !currentOpen);
        }}
      >
        <span className="menu-select__value">{shown}</span>
        <span className="menu-select__arrow" aria-hidden />
      </button>
      {menu}
    </div>
  );
}
