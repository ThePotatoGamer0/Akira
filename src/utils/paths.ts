import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.join(here, "..", "..");

export const INIT_LOCK = path.join(ROOT, "init.lock");

export const DIR_INPUT_CHARACTERS = path.join(ROOT, "input", "characters");
export const DIR_INPUT_FRAMES = path.join(ROOT, "input", "frames");
export const DIR_INPUT_SHOWCASE = path.join(ROOT, "input", "showcase");

/** Pre-generated Akira's Gift animations per frame */
export const DIR_ASSETS_FRAMES_GIFT = path.join(ROOT, "assets", "frames", "gift");

export const DIR_ASSETS_CARDS = path.join(ROOT, "assets", "cards");

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function cardAssetDir(seriesSlug: string, characterSlug: string, frameId: number): string {
  return path.join(DIR_ASSETS_CARDS, seriesSlug, characterSlug, String(frameId));
}
