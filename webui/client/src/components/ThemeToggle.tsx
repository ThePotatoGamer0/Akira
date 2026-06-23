import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "akira-webui-theme";

function getTheme(): "light" | "dark" {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function subscribeTheme(cb: () => void) {
  const obs = new MutationObserver(() => cb());
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, getTheme);

  const toggle = useCallback(() => {
    const next = getTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="theme-toggle-host">
      <button
        type="button"
        className="theme-toggle"
        id="webui-theme-toggle"
        aria-pressed={theme === "dark"}
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
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
