const KEY = "akira-webui-chrome";

/** Top bar (default) or a left column on wide screens. */
export type ChromeLayout = "top" | "rail";

export function chromeLayout(): ChromeLayout {
  try {
    return localStorage.getItem(KEY) === "rail" ? "rail" : "top";
  } catch {
    return "top";
  }
}

export function setChromeLayout(layout: ChromeLayout): void {
  try {
    localStorage.setItem(KEY, layout);
  } catch {
    /* Private mode, or full. */
  }
}

/** True when the left-column chrome can show (wide desktop, not a phone shell). */
export function chromeRailSupported(): boolean {
  return window.matchMedia("(min-width: 900px)").matches;
}
