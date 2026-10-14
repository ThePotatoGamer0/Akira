import type { Request, Response } from "express";
import { ensureCardImage, type CardImageKind } from "../../../../src/game/compose.js";
import { GameError } from "../../../../src/game/errors.js";
import { prisma } from "../db/client.js";

const KINDS: Record<string, CardImageKind> = {
  "normal.png": "normal",
  "shiny.apng": "shiny",
  "burn.apng": "burn",
};

const SAFE = /^[a-zA-Z0-9_-]+$/;

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
    const file = await ensureCardImage({
      variantId: variant.id,
      seriesSlug: variant.character.series.slug,
      characterSlug: variant.character.slug,
      imageFile: variant.image,
      characterName: variant.character.name,
      frameId,
      printNumber,
      dye: dyeKey === "none" ? null : dyeKey,
      kind,
    });
    res.sendFile(file, { headers: { "Content-Type": "image/png" } });
  } catch (err) {
    if (err instanceof GameError) {
      res.status(404).end();
      return;
    }
    throw err;
  }
}
