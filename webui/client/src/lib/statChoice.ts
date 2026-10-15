const PREFIX = "akira.stats.";

export function readStatChoice(key: string, fallback: string): string {
  try {
    return localStorage.getItem(PREFIX + key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeStatChoice(key: string, value: string): void {
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    /* Private mode can refuse storage. The dropdown still works for this visit. */
  }
}
