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
};

function placeMenu(trigger: HTMLElement): Box {
  const rect = trigger.getBoundingClientRect();
  const gap = 6;
  const below = window.innerHeight - rect.bottom - gap;
  const above = rect.top - gap;
  const up = below < 220 && above > below;
  const room = Math.max(120, up ? above : below);
  const minWidth = Math.min(Math.max(rect.width, 224), window.innerWidth - 16);
  const maxLeft = Math.max(8, window.innerWidth - minWidth - 8);
  return {
    top: up ? rect.top - gap : rect.bottom + gap,
    left: Math.max(8, Math.min(rect.left, maxLeft)),
    minWidth,
    maxHeight: Math.min(256, room),
    up,
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
}) {
  const variant = props.variant ?? "field";
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const menuId = useId();
  const current = props.options.find((option) => option.value === props.value);
  const shown = props.display ?? current?.label ?? props.options[0]?.label ?? "";

  useEffect(() => {
    if (props.disabled) setOpen(false);
  }, [props.disabled]);

  useLayoutEffect(() => {
    if (!open) return;
    const trigger = rootRef.current?.querySelector("button");
    if (!(trigger instanceof HTMLElement)) return;
    function move() {
      if (trigger instanceof HTMLElement) setBox(placeMenu(trigger));
    }
    move();
    window.addEventListener("resize", move);
    window.addEventListener("scroll", move, true);
    return () => {
      window.removeEventListener("resize", move);
      window.removeEventListener("scroll", move, true);
    };
  }, [open]);

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
          <ul
            ref={menuRef}
            id={menuId}
            className={box.up ? "menu-select__menu is-up" : "menu-select__menu"}
            role="listbox"
            aria-label={props.label}
            style={{
              top: box.top,
              left: box.left,
              minWidth: box.minWidth,
              maxHeight: box.maxHeight,
            }}
          >
            {props.options.map((option, index) => {
              const selected = option.value === props.value;
              return (
                <li key={`${index}:${option.value}`}>
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
          </ul>,
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
