import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { listFrames } from "../../utils/frames.js";
import { DIR_INPUT_CHARACTERS } from "../../utils/paths.js";

export type CardVariantJson = {
  id: string;
  name: string;
  rarity: string;
  image: string;
};

export type CharacterJsonData = {
  id: string;
  name: string;
  aliases?: string[];
  description?: string;
  gender?: string;
  cards: CardVariantJson[];
};

export type VariantAssetEntry = {
  seriesSlug: string;
  characterSlug: string;
  variantId: string;
  pngPath: string;
};

export function listVariantAssets(): VariantAssetEntry[] {
  if (!fs.existsSync(DIR_INPUT_CHARACTERS)) return [];
  const out: VariantAssetEntry[] = [];

  for (const seriesSlug of fs.readdirSync(DIR_INPUT_CHARACTERS)) {
    const seriesDir = path.join(DIR_INPUT_CHARACTERS, seriesSlug);
    if (!fs.statSync(seriesDir).isDirectory()) continue;

    for (const characterSlug of fs.readdirSync(seriesDir)) {
      const charDir = path.join(seriesDir, characterSlug);
      if (!fs.statSync(charDir).isDirectory()) continue;

      const jsonPath = path.join(charDir, "character.json");
      if (!fs.existsSync(jsonPath)) continue;

      try {
        const data: CharacterJsonData = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
        for (const card of data.cards) {
          const pngPath = path.join(charDir, card.image);
          if (fs.existsSync(pngPath)) {
            out.push({
              seriesSlug,
              characterSlug,
              variantId: card.id,
              pngPath,
            });
          } else {
            console.warn(`Missing art for ${card.id}: ${pngPath}`);
          }
        }
      } catch (err) {
        console.error(`Failed to parse metadata at ${jsonPath}:`, err);
      }
    }
  }
  return out;
}

/**
 * Init no longer pre-renders every variant and frame. Card images are composed
 * the first time a drop or a view needs them, then cached on disk.
 */
export async function runGenerator(): Promise<void> {
  const frames = listFrames();
  const variants = listVariantAssets();
  if (frames.length === 0) {
    console.warn("No frames found. Expected input/frames/{id}/frame.png.");
  }
  if (variants.length === 0) {
    console.warn("No character art found under input/characters.");
  }
  console.log(
    `Catalog ready: ${variants.length} variant image(s), ${frames.length} frame(s). Cards are composed on demand.`,
  );
}

const isCliEntry = Boolean(
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url,
);
if (isCliEntry) {
  await runGenerator();
}
