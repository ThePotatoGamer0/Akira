import fs from "node:fs";
import { cardCacheFile, variantArtPath } from "../utils/paths.js";
import type { CachedCardGroup } from "./card-cache.js";
import { writeCardImages } from "./compose.js";

export type RedrawVariant = {
  image: string;
  seriesSlug: string;
  characterSlug: string;
  characterName: string;
  seriesName: string;
};

export type CacheWorkerJob = {
  id: number;
  group: CachedCardGroup;
  variant: RedrawVariant;
};

export type CacheWorkerResult = {
  id: number;
  ok: boolean;
  redrawn: number;
  skipped: number;
  error?: string;
};

export function cachedGroupFile(group: CachedCardGroup, fileName: Parameters<typeof cardCacheFile>[0]["fileName"]): string {
  return cardCacheFile({
    variantId: group.variantId,
    frameId: group.frameId,
    printKey: group.printNumber === null ? "preview" : `p${group.printNumber}`,
    dyeKey: group.dye ?? "none",
    fileName,
  });
}

/** Wipe this group's cached pictures and draw them again from the current portrait. */
export async function redrawCachedGroup(
  group: CachedCardGroup,
  variant: RedrawVariant,
): Promise<{ redrawn: number; skipped: number }> {
  const artPath = variantArtPath(variant.seriesSlug, variant.characterSlug, variant.image);
  if (!fs.existsSync(artPath)) {
    return { redrawn: 0, skipped: group.files.length };
  }

  for (const file of group.files) {
    fs.rmSync(cachedGroupFile(group, file.fileName), { force: true });
  }
  if (group.files.some((file) => file.kind !== "normal")) {
    fs.rmSync(cachedGroupFile(group, "normal.png"), { force: true });
  }

  try {
    await writeCardImages({
      variantId: group.variantId,
      seriesSlug: variant.seriesSlug,
      characterSlug: variant.characterSlug,
      imageFile: variant.image,
      characterName: variant.characterName,
      seriesName: variant.seriesName,
      frameId: group.frameId,
      printNumber: group.printNumber,
      dye: group.dye,
    }, group.files);
    return { redrawn: group.files.length, skipped: 0 };
  } catch (err) {
    console.error(`Card refresh failed for ${group.variantId}.`, err);
    return { redrawn: 0, skipped: group.files.length };
  }
}
