import type { TextStyle } from "../utils/frames.js";

/** How far below the style's y a line sits. Top-anchored text grows downward. */
export function lineOffset(
  anchor: TextStyle["verticalAnchor"],
  index: number,
  count: number,
  fontSize: number,
): number {
  const step = fontSize + gapFor(fontSize);
  if (anchor === "bottom") return -((count - 1 - index) * step);
  if (anchor === "center") return -((count - 1) * step) / 2 + index * step;
  return index * step;
}

/** Width and height the name may use without leaving the frame or covering the print. */
export function nameLimits(
  style: TextStyle,
  print: TextStyle | null,
  width: number,
  height: number,
): { maxWidth: number; maxHeight: number } {
  const side = Math.max(12, Math.round(width * 0.06));
  let maxWidth: number;
  if (style.horizontalAnchor === "center") {
    maxWidth = Math.min(style.x, width - style.x) * 2 - side * 2;
  } else if (style.horizontalAnchor === "right") {
    maxWidth = style.x - side;
  } else {
    maxWidth = width - style.x - side;
  }
  const printTop = print ? print.y - Math.ceil(print.fontSize * 0.65) : height - 4;
  const bottom = Math.min(height - 4, print && print.y > style.y ? printTop : height - 4);
  const origin = style.verticalAnchor === "bottom"
    ? style.y - style.fontSize
    : style.verticalAnchor === "center"
      ? style.y - style.fontSize / 2
      : style.y;
  return {
    maxWidth: Math.max(40, maxWidth),
    maxHeight: Math.max(style.fontSize * 0.5, bottom - origin),
  };
}

/** Split a name on spaces so the two lines are as even as they can be. */
export function splitName(name: string, widthOf: (text: string) => number): [string, string] | null {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;
  let best: [string, string] | null = null;
  let bestMax = Infinity;
  for (let index = 1; index < words.length; index++) {
    const left = words.slice(0, index).join(" ");
    const right = words.slice(index).join(" ");
    const max = Math.max(widthOf(left), widthOf(right));
    if (max < bestMax) {
      bestMax = max;
      best = [left, right];
    }
  }
  return best;
}

export type FittedLine = { text: string; fontSize: number };

export function fitSingleLine(input: {
  text: string;
  fontSize: number;
  maxWidth: number;
  minFont?: number;
  measure: (text: string, fontSize: number) => number;
}): FittedLine {
  const text = input.text.trim();
  const minFont = input.minFont ?? 11;
  let size = input.fontSize;
  while (size > minFont && input.measure(text, size) > input.maxWidth) size -= 1;
  return { text, fontSize: size };
}

const MIN_FONT = 12;

function gapFor(fontSize: number): number {
  return Math.round(fontSize * 0.15);
}

export function nameBlockHeight(lineCount: number, fontSize: number): number {
  if (lineCount <= 1) return fontSize;
  return fontSize * 2 + gapFor(fontSize);
}

/**
 * The biggest size that fits the band. One line when that is larger than two lines,
 * so a short name fills the space a second line would have used.
 */
export function fitCharacterName(input: {
  name: string;
  fontSize: number;
  maxWidth: number;
  maxHeight: number;
  measure: (text: string, fontSize: number) => number;
}): FittedLine[] {
  const name = input.name.trim();
  if (!name) return [];
  const { maxWidth, maxHeight, measure } = input;
  const ceiling = Math.max(MIN_FONT, Math.floor(Math.max(input.fontSize, maxHeight)));

  let oneSize: number | null = null;
  for (let size = ceiling; size >= MIN_FONT; size -= 1) {
    if (size <= maxHeight && measure(name, size) <= maxWidth) {
      oneSize = size;
      break;
    }
  }

  let twoSize: number | null = null;
  let twoLines: [string, string] | null = null;
  for (let size = ceiling; size >= MIN_FONT; size -= 1) {
    if (nameBlockHeight(2, size) > maxHeight) continue;
    const split = splitName(name, (text) => measure(text, size));
    if (!split) continue;
    if (measure(split[0], size) <= maxWidth && measure(split[1], size) <= maxWidth) {
      twoSize = size;
      twoLines = split;
      break;
    }
  }

  if (oneSize !== null && (twoSize === null || oneSize >= twoSize)) {
    return [{ text: name, fontSize: oneSize }];
  }
  if (twoSize !== null && twoLines) {
    return [
      { text: twoLines[0], fontSize: twoSize },
      { text: twoLines[1], fontSize: twoSize },
    ];
  }

  const split = splitName(name, (text) => measure(text, MIN_FONT));
  if (split) {
    return [
      { text: split[0], fontSize: MIN_FONT },
      { text: split[1], fontSize: MIN_FONT },
    ];
  }
  return [{ text: name, fontSize: MIN_FONT }];
}
