const KEY = "akira-haptics";

export function hapticsEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return false;
  }
}

function pulse(ms: number): void {
  if (!hapticsEnabled()) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* this phone refused the buzz */
  }
}

export function setHapticsEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    return;
  }
  if (on) pulse(15);
}

function pressedControl(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const el = target.closest("button, [role='button'], [role='switch'], [role='option'], .webui-nav a, .composer-plus");
  if (!el) return false;
  if (el.matches(":disabled") || el.getAttribute("aria-disabled") === "true") return false;
  return true;
}

/** A short buzz on a press, and a slightly longer one when a menu selection lands. */
export function installHaptics(): void {
  const host = window as Window & { __akiraHaptics?: boolean };
  if (host.__akiraHaptics) return;
  host.__akiraHaptics = true;
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 0) return;
      if (!pressedControl(event.target)) return;
      pulse(12);
    },
    true,
  );
  document.addEventListener(
    "change",
    (event) => {
      if (event.target instanceof HTMLSelectElement) pulse(18);
    },
    true,
  );
}
