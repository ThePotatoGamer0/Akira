import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.join(here, "..", "..");

export const INIT_LOCK = path.join(ROOT, "init.lock");

export const DIR_INPUT_CHARACTERS = path.join(ROOT, "input", "characters");
export const DIR_INPUT_SERIES = path.join(ROOT, "input", "series");
export const DIR_INPUT_FRAMES = path.join(ROOT, "input", "frames");
export const DIR_INPUT_SHOWCASE = path.join(ROOT, "input", "showcase");

export const DIR_ASSETS_CARDS = path.join(ROOT, "assets", "cards");

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

const SAFE_SEGMENT = /^[a-zA-Z0-9_-]+$/;

export function variantArtPath(seriesSlug: string, characterSlug: string, imageFile: string): string {
  return path.join(DIR_INPUT_CHARACTERS, seriesSlug, characterSlug, imageFile);
}

export function seriesCoverPath(seriesSlug: string): string {
  if (!SAFE_SEGMENT.test(seriesSlug)) {
    throw new Error(`Unsafe series slug: ${seriesSlug}`);
  }
  return path.join(DIR_INPUT_SERIES, seriesSlug, "cover.png");
}

export function printCacheKey(printNumber: number | null): string {
  if (printNumber === null) return "preview";
  return `p${printNumber}`;
}

export function dyeCacheKey(dye: string | null): string {
  if (!dye) return "none";
  if (!SAFE_SEGMENT.test(dye)) return "custom";
  return dye;
}

export type CardCacheFileName = "normal.png" | "shiny.gif" | "shiny.apng" | "burn.gif" | "burn.apng";

export function cardCacheFile(input: {
  variantId: string;
  frameId: number;
  printKey: string;
  dyeKey: string;
  fileName: CardCacheFileName;
}): string {
  for (const part of [input.variantId, input.printKey, input.dyeKey]) {
    if (!SAFE_SEGMENT.test(part)) {
      throw new Error(`Unsafe cache key: ${part}`);
    }
  }
  if (!Number.isInteger(input.frameId) || input.frameId < 0) {
    throw new Error("Unsafe frame id");
  }
  return path.join(
    DIR_ASSETS_CARDS,
    input.variantId,
    String(input.frameId),
    input.printKey,
    input.dyeKey,
    input.fileName,
  );
}