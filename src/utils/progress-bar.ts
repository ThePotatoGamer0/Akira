import { icon, type IconKey } from "./icons.js";

const DEFAULT_CELLS = 8;

function piece(key: IconKey): string {
  return icon(key);
}

/**
 * A seek bar made of application emojis. `ratio` is 0 to 1.
 * The first and last cells are the rounded caps. A partial bar ends in a rounded cap.
 */
export function progressBar(ratio: number, cells = DEFAULT_CELLS): string {
  const count = Math.max(3, Math.floor(cells));
  const clamped = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0;
  if (clamped <= 0) {
    return [piece("bar-start-empty"), ...Array.from({ length: count - 2 }, () => piece("bar-empty")), piece("bar-end")].join("");
  }
  if (clamped >= 1) {
    return [piece("bar-start"), ...Array.from({ length: count - 2 }, () => piece("bar-fill")), piece("bar-end-fill")].join("");
  }
  const head = Math.min(count - 2, Math.max(1, Math.round(clamped * (count - 1))));
  const parts = [piece("bar-start")];
  for (let index = 1; index < count - 1; index += 1) {
    if (index < head) parts.push(piece("bar-fill"));
    else if (index === head) parts.push(piece("bar-head"));
    else parts.push(piece("bar-empty"));
  }
  parts.push(piece("bar-end"));
  return parts.join("");
}
