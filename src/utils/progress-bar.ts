import { icon, type IconKey } from "./icons.js";
import { BAR_CELL_PX, barCellKey, type BarRole } from "./seek-bar.js";

const DEFAULT_CELLS = 8;

function roleAt(index: number, count: number): BarRole {
  if (index === 0) return "start";
  if (index === count - 1) return "end";
  return "mid";
}

export function progressBarKeys(ratio: number, cells = DEFAULT_CELLS): string[] {
  const count = Math.max(2, Math.floor(cells));
  const clamped = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0;
  const maxPx = count * BAR_CELL_PX;
  const filled =
    clamped <= 0 ? 0 : clamped >= 1 ? maxPx : Math.max(1, Math.round(clamped * maxPx));
  return Array.from({ length: count }, (_, index) =>
    barCellKey(roleAt(index, count), filled - index * BAR_CELL_PX),
  );
}

/**
 * A seek bar made of application emojis. `ratio` is 0 to 1.
 * Each cell is 32 display pixels, including when the rounded head crosses a cell seam.
 */
export function progressBar(ratio: number, cells = DEFAULT_CELLS): string {
  return progressBarKeys(ratio, cells)
    .map((key) => icon(key as IconKey))
    .join("");
}
