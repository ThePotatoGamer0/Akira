/**
 * WebUI themes.
 *
 * `data-theme` names the palette and `data-mode` says which way round it is read.
 * Each palette owns on/off itself, which keeps the naming honest: Discord, AMOLED,
 * Nord, Dracula, Solarized and Crimson are always dark, Paper is always light, and
 * Akira and Catppuccin have both. Nothing has to pretend to be "dark" by name just
 * because it happens to be.
 *
 * A theme is never swapped on a live page. The choice is written down and the
 * page is then unloaded and loaded again, so the inline script in index.html --
 * which repeats these rules, because it has to paint before the first React
 * render -- is the only thing that ever applies it. Repainting the running page
 * in a new palette was the cause of a hang that no amount of trimming fixed, so
 * the switch no longer tries: it leaves.
 */

export type ThemeId =
  | "akira"
  | "catppuccin"
  | "discord"
  | "amoled"
  | "nord"
  | "dracula"
  | "solarized"
  | "paper"
  | "crimson";
export type ThemeMode = "light" | "dark";

/** One round, or "both" for a palette with a light and a dark side. */
export type ThemeLooks = ThemeMode | "both";

export type ThemeInfo = {
  id: ThemeId;
  label: string;
  /** What it looks like, for the settings menu. */
  hint: string;
  /** Which round(s) it has. The menu's icon and the moon button both follow it. */
  looks: ThemeLooks;
};

/** Every palette's mode, and its --page, which the meta bar copies. Mirrors index.html. */
const PALETTES: Record<ThemeId, { mode: ThemeLooks; page: Record<ThemeMode, string> }> = {
  akira: { mode: "both", page: { light: "#f7f4fc", dark: "#0f0c14" } },
  catppuccin: { mode: "both", page: { light: "#eff1f5", dark: "#1e1e2e" } },
  discord: { mode: "dark", page: { light: "#313338", dark: "#313338" } },
  amoled: { mode: "dark", page: { light: "#000000", dark: "#000000" } },
  nord: { mode: "dark", page: { light: "#2e3440", dark: "#2e3440" } },
  dracula: { mode: "dark", page: { light: "#282a36", dark: "#282a36" } },
  solarized: { mode: "dark", page: { light: "#002b36", dark: "#002b36" } },
  paper: { mode: "light", page: { light: "#faf9f6", dark: "#faf9f6" } },
  crimson: { mode: "dark", page: { light: "#0b0606", dark: "#0b0606" } },
};

const THEME_LIST: readonly Omit<ThemeInfo, "looks">[] = [
  { id: "akira", label: "Akira", hint: "Purple and pink, light or dark." },
  { id: "catppuccin", label: "Catppuccin", hint: "Mauve and lavender; Latte by day, Mocha by night." },
  { id: "discord", label: "Discord", hint: "Blurple on Discord's greys." },
  { id: "amoled", label: "AMOLED", hint: "True black, for OLED screens." },
  { id: "nord", label: "Nord", hint: "Frosty blue-grey with icy cyan." },
  { id: "dracula", label: "Dracula", hint: "Purple, pink and cyan on charcoal." },
  { id: "solarized", label: "Solarized", hint: "Muted teal on blue-black." },
  { id: "paper", label: "Paper", hint: "Near-white with an indigo accent." },
  { id: "crimson", label: "Crimson", hint: "Red on near-black." },
];

/** Every theme, in menu order, each with the round(s) PALETTES gives it. */
export const THEMES: readonly ThemeInfo[] = THEME_LIST.map((theme) => ({
  ...theme,
  looks: PALETTES[theme.id].mode,
}));

/** True for a palette with both rounds, which is the only kind the moon can flip. */
export function toggles(theme: ThemeInfo): boolean {
  return theme.looks === "both";
}

export const DEFAULT_THEME: ThemeId = "akira";
const STORAGE_KEY = "akira-webui-theme";

/** How a stored value splits: `"akira:dark"`, or a bare `"dark"`/`"light"` from before themes. */
type Stored = { theme: ThemeId; mode: ThemeMode | null };

function isTheme(value: string): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

function readStored(): Stored {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    raw = null;
  }
  if (!raw) return { theme: DEFAULT_THEME, mode: null };
  const [head, tail] = raw.split(":");
  if (head === "light" || head === "dark") return { theme: DEFAULT_THEME, mode: head };
  if (!isTheme(head)) return { theme: DEFAULT_THEME, mode: null };
  return { theme: head, mode: tail === "light" || tail === "dark" ? tail : null };
}

function prefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** The status bar colour for the current theme, shown on phones above the page. */
export function backgroundColor(theme = currentTheme()): string {
  // The manifest cannot read a CSS variable, so these are copies of each --page.
  return PALETTES[theme].page[resolveMode(theme, readStored().mode)];
}

/** The mode for a palette: its stored mode, or the system's for one that has both. */
export function resolveMode(theme: ThemeId, mode: ThemeMode | null): ThemeMode {
  const fixed = PALETTES[theme].mode;
  if (fixed !== "both") return fixed;
  return mode ?? (prefersDark() ? "dark" : "light");
}

/**
 * The theme lives in two attributes on <html> and nowhere in React state.
 *
 * It is deliberately not a subscribed store. An earlier version notified React on
 * attribute changes with a MutationObserver, and that looped: once any observer
 * with an attributeFilter is attached to an element, browsers widen notification
 * to every attribute on it. <html> also carries theme-color and lang, so every
 * write re-notified, every notification re-rendered the whole page, and the main
 * thread never got control back. Callers read the attribute when they render and
 * keep their own copy when they need one.
 */
export function currentTheme(): ThemeId {
  const theme = document.documentElement.getAttribute("data-theme");
  return theme && isTheme(theme) ? theme : DEFAULT_THEME;
}

export function currentMode(): ThemeMode {
  return document.documentElement.getAttribute("data-mode") === "dark" ? "dark" : "light";
}

/**
 * Leave this page and come back with the theme stored, which the head script then
 * paints before anything renders.
 *
 * The document is deliberately torn down rather than reloaded in place: the old
 * page never gets a chance to repaint in a palette it was not built for, and a
 * fresh document also picks up new CSS, which a plain reload can serve from cache.
 * The current address is kept, and the next load is navigational so the browser
 * treats it as a new visit rather than a back-button target.
 */
function unloadWithTheme(theme: ThemeId, mode: ThemeMode | null, keepMode: boolean): void {
  // A bare id is all a one-round palette needs, and all the head script expects
  // for one; `theme:mode` is for the palette that has two.
  const nextMode = keepMode && PALETTES[theme].mode === "both" ? mode : null;
  try {
    localStorage.setItem(STORAGE_KEY, nextMode ? `${theme}:${nextMode}` : theme);
  } catch {
    /* Private mode, or full. There is then nothing to reload into, so stay put. */
    return;
  }
  document.documentElement.replaceChildren();
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.setAttribute("data-mode", resolveMode(theme, nextMode));
  window.location.replace(window.location.href);
}

/**
 * Pick a palette. The page unloads and comes back in it.
 *
 * A mode left over from a different palette does not carry: only Akira has two
 * rounds, so coming back from Discord means coming back to the one you left,
 * not to whatever round Akira was last in.
 */
export function setTheme(theme: ThemeId, mode?: ThemeMode | null): void {
  if (mode === undefined) {
    const previous = readStored();
    unloadWithTheme(theme, previous.theme === theme ? previous.mode : null, true);
    return;
  }
  // An explicit round is still only kept for a palette that has two.
  unloadWithTheme(theme, mode, true);
}

/**
 * Switch the Akira palette between light and dark. A one-mode theme has nothing
 * to switch, so it ignores this.
 */
export function toggleMode(): void {
  const theme = currentTheme();
  const info = THEMES.find((entry) => entry.id === theme);
  if (!info || !toggles(info)) return;
  // The palette stays; only the round changes.
  unloadWithTheme(theme, currentMode() === "dark" ? "light" : "dark", true);
}
