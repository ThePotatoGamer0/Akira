import { useCallback, useState } from "react";
import { THEMES, currentMode, currentTheme, toggleMode, toggles as hasTwoLooks } from "../lib/theme.js";

export function ThemeToggle() {
  // Read once and keep a copy: the theme is an attribute on <html>, not React state.
  const [theme] = useState(currentTheme);
  const [dark] = useState(() => currentMode() === "dark");
  // A theme with one look has nothing to flip, so the button steps out of the way
  // rather than sitting there doing nothing. The switcher lives in Settings.
  const entry = THEMES.find((candidate) => candidate.id === theme);
  const toggles = entry ? hasTwoLooks(entry) : true;

  // This press does not flip the icon in place: it unloads the page, which comes
  // back with the other side of the palette already painted.
  const toggle = useCallback(() => toggleMode(), []);

  if (!toggles) return null;

  return (
    <div className="theme-toggle-host">
      <button
        type="button"
        className="theme-toggle"
        id="webui-theme-toggle"
        aria-pressed={dark}
        aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
        onClick={toggle}
      >
        <svg className="theme-toggle__icon theme-toggle__sun" width="20" height="20" viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.3 11.3l1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
          />
        </svg>
        <svg className="theme-toggle__icon theme-toggle__moon" width="18" height="18" viewBox="0 0 24 24" aria-hidden>
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 12.8A9 9 0 1111.2 3a7 7 0 0010 9.8z"
          />
        </svg>
      </button>
    </div>
  );
}
