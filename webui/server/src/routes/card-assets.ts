import fs from "node:fs";
import type { Request, Response } from "express";
import { ensureCardImage, type CardAnimationFormat, type CardImageKind } from "../../../../src/game/compose.js";
import { GameError } from "../../../../src/game/errors.js";
import { seriesCoverPath, variantArtPath } from "../../../../src/utils/paths.js";
import { prisma } from "../db/client.js";

const KINDS: Record<string, CardImageKind> = {
  "normal.png": "normal",
  "shiny.gif": "shiny",
  "shiny.apng": "shiny",
  "burn.gif": "burn",
  "burn.apng": "burn",
};

const SAFE = /^[a-zA-Z0-9_-]+$/;
const SAFE_FILE = /^[a-zA-Z0-9._-]+\.(png|jpe?g|webp|gif)$/i;

function segment(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

/** Compose a cached card image when the collection asks for one that is not on disk yet. */
export async function serveMissingCardAsset(req: Request, res: Response): Promise<void> {
  const variantId = segment(req.params["variantId"]);
  const frameRaw = segment(req.params["frameId"]);
  const printKey = segment(req.params["printKey"]);
  const dyeKey = segment(req.params["dyeKey"]);
  const fileName = segment(req.params["fileName"]);
  const kind = KINDS[fileName];
  const frameId = Number(frameRaw);

  if (
    !kind ||
    !SAFE.test(variantId) ||
    !SAFE.test(printKey) ||
    !SAFE.test(dyeKey) ||
    !Number.isInteger(frameId) ||
    frameId < 0
  ) {
    res.status(404).end();
    return;
  }

  let printNumber: number | null;
  if (printKey === "preview") {
    printNumber = null;
  } else {
    const match = /^p(\d+)$/.exec(printKey);
    if (!match) {
      res.status(404).end();
      return;
    }
    printNumber = Number(match[1]);
  }

  const variant = await prisma.cardVariant.findUnique({
    where: { id: variantId },
    include: { character: { include: { series: true } } },
  });
  if (!variant) {
    res.status(404).end();
    return;
  }

  try {
    const format: CardAnimationFormat = fileName.endsWith(".apng") ? "apng" : "gif";
    const file = await ensureCardImage({
      variantId: variant.id,
      seriesSlug: variant.character.series.slug,
      characterSlug: variant.character.slug,
      imageFile: variant.image,
      characterName: variant.character.name,
      seriesName: variant.character.series.name,
      frameId,
      printNumber,
      dye: dyeKey === "none" ? null : dyeKey,
      kind,
    }, format);
    res.sendFile(file, {
      headers: { "Content-Type": fileName.endsWith(".gif") ? "image/gif" : "image/png" },
    });
  } catch (err) {
    if (err instanceof GameError) {
      res.status(404).end();
      return;
    }
    throw err;
  }
}

/** Unframed character art for the catalog. Collection cards stay on /api/static/cards. */
export function serveCatalogPortrait(req: Request, res: Response): void {
  const seriesSlug = segment(req.params["seriesSlug"]);
  const characterSlug = segment(req.params["characterSlug"]);
  const fileName = segment(req.params["fileName"]);
  if (!SAFE.test(seriesSlug) || !SAFE.test(characterSlug) || !SAFE_FILE.test(fileName)) {
    res.status(404).end();
    return;
  }
  const file = variantArtPath(seriesSlug, characterSlug, fileName);
  if (!fs.existsSync(file)) {
    res.status(404).end();
    return;
  }
  res.sendFile(file, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } });
}

/** AniList series poster stored under input/series. */
export function serveSeriesCover(req: Request, res: Response): void {
  const seriesSlug = segment(req.params["seriesSlug"]);
  if (!SAFE.test(seriesSlug)) {
    res.status(404).end();
    return;
  }
  let file: string;
  try {
    file = seriesCoverPath(seriesSlug);
  } catch {
    res.status(404).end();
    return;
  }
  if (!fs.existsSync(file)) {
    res.status(404).end();
    return;
  }
  res.sendFile(file, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } });
}
