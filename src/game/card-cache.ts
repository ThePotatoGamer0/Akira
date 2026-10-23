import fs from "node:fs";
import path from "node:path";
import { prisma } from "../db/client.js";
import { DIR_ASSETS_CARDS, cardCacheFile, variantArtPath, type CardCacheFileName } from "../utils/paths.js";
import { ensureCardImage, type CardAnimationFormat, type CardImageKind } from "./compose.js";

const CACHE_FILES: Record<CardCacheFileName, { kind: CardImageKind; format: CardAnimationFormat; rank: number }> = {
  "normal.png": { kind: "normal", format: "gif", rank: 0 },
  "shiny.gif": { kind: "shiny", format: "gif", rank: 1 },
  "shiny.apng": { kind: "shiny", format: "apng", rank: 2 },
  "burn.gif": { kind: "burn", format: "gif", rank: 3 },
  "burn.apng": { kind: "burn", format: "apng", rank: 4 },
};

export type CachedCardFile = {
  fileName: CardCacheFileName;
  kind: CardImageKind;
  format: CardAnimationFormat;
};

export type CachedCardGroup = {
  variantId: string;
  frameId: number;
  printNumber: number | null;
  dye: string | null;
  files: CachedCardFile[];
};

function isCacheFile(name: string): name is CardCacheFileName {
  return Object.prototype.hasOwnProperty.call(CACHE_FILES, name);
}

function parsePrint(key: string): number | null | undefined {
  if (key === "preview") return null;
  const match = /^p(\d+)$/.exec(key);
  if (!match?.[1] || String(Number(match[1])) !== match[1]) return undefined;
  return Number(match[1]);
}

function parseDye(key: string): string | null | undefined {
  if (key === "none") return null;
  if (key === "custom") return undefined;
  if (!/^[a-zA-Z0-9_-]+$/.test(key)) return undefined;
  return key;
}

function directories(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => {
    try {
      return fs.statSync(path.join(dir, name)).isDirectory();
    } catch {
      return false;
    }
  });
}

/** Groups of card pictures already saved under the cache root. Unreadable folders are counted and left alone. */
export function listCachedCardGroups(root: string): { groups: CachedCardGroup[]; skipped: number } {
  const groups: CachedCardGroup[] = [];
  let skipped = 0;
  for (const variantId of directories(root)) {
    if (!/^[a-zA-Z0-9_-]+$/.test(variantId)) continue;
    for (const frameName of directories(path.join(root, variantId))) {
      if (!/^\d+$/.test(frameName)) continue;
      const frameId = Number(frameName);
      if (!Number.isInteger(frameId) || String(frameId) !== frameName) continue;
      for (const printKey of directories(path.join(root, variantId, frameName))) {
        for (const dyeKey of directories(path.join(root, variantId, frameName, printKey))) {
          const folder = path.join(root, variantId, frameName, printKey, dyeKey);
          let names: string[] = [];
          try {
            names = fs.readdirSync(folder);
          } catch {
            continue;
          }
          const files = names.filter(isCacheFile).sort((left, right) => CACHE_FILES[left].rank - CACHE_FILES[right].rank);
          if (files.length === 0) continue;
          const printNumber = parsePrint(printKey);
          const dye = parseDye(dyeKey);
          if (printNumber === undefined || dye === undefined) {
            skipped += files.length;
            continue;
          }
          groups.push({
            variantId,
            frameId,
            printNumber,
            dye,
            files: files.map((fileName) => ({ fileName, kind: CACHE_FILES[fileName].kind, format: CACHE_FILES[fileName].format })),
          });
        }
      }
    }
  }
  return { groups, skipped };
}

async function variantsById(ids: string[]) {
  const found = new Map<string, {
    image: string;
    character: { name: string; slug: string; series: { name: string; slug: string } };
  }>();
  if (ids.length === 0) return found;
  for (let index = 0; index < ids.length; index += 400) {
    const slice = ids.slice(index, index + 400);
    const rows = await prisma.cardVariant.findMany({
      where: { id: { in: slice } },
      include: { character: { include: { series: true } } },
    });
    for (const row of rows) found.set(row.id, row);
  }
  return found;
}

export type RefreshProgress = { done: number; total: number };

/** Delete each cached picture and draw it again from the current portrait. */
export async function refreshCardCache(
  onProgress?: (progress: RefreshProgress) => void,
): Promise<{ redrawn: number; skipped: number }> {
  const listed = listCachedCardGroups(DIR_ASSETS_CARDS);
  const variants = await variantsById([...new Set(listed.groups.map((group) => group.variantId))]);
  const total = listed.skipped + listed.groups.reduce((sum, group) => sum + group.files.length, 0);
  let done = listed.skipped;
  let redrawn = 0;
  let skipped = listed.skipped;
  const advance = (count: number) => {
    done += count;
    onProgress?.({ done, total });
  };
  onProgress?.({ done, total });

  for (const group of listed.groups) {
    const variant = variants.get(group.variantId);
    const artPath = variant
      ? variantArtPath(variant.character.series.slug, variant.character.slug, variant.image)
      : null;
    if (!variant || !artPath || !fs.existsSync(artPath)) {
      skipped += group.files.length;
      advance(group.files.length);
      continue;
    }

    const animated = group.files.some((file) => file.kind !== "normal");
    for (const file of group.files) {
      const cachePath = cardCacheFile({
        variantId: group.variantId,
        frameId: group.frameId,
        printKey: group.printNumber === null ? "preview" : `p${group.printNumber}`,
        dyeKey: group.dye ?? "none",
        fileName: file.fileName,
      });
      fs.rmSync(cachePath, { force: true });
    }
    if (animated) {
      fs.rmSync(cardCacheFile({
        variantId: group.variantId,
        frameId: group.frameId,
        printKey: group.printNumber === null ? "preview" : `p${group.printNumber}`,
        dyeKey: group.dye ?? "none",
        fileName: "normal.png",
      }), { force: true });
    }

    for (const file of group.files) {
      try {
        await ensureCardImage({
          variantId: group.variantId,
          seriesSlug: variant.character.series.slug,
          characterSlug: variant.character.slug,
          imageFile: variant.image,
          characterName: variant.character.name,
          seriesName: variant.character.series.name,
          frameId: group.frameId,
          printNumber: group.printNumber,
          dye: group.dye,
          kind: file.kind,
        }, file.format);
        redrawn += 1;
      } catch (err) {
        skipped += 1;
        console.error(`Card refresh failed for ${group.variantId}.`, err);
      }
      advance(1);
    }
  }

  return { redrawn, skipped };
}
