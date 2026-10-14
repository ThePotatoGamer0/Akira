import fs from "node:fs";
import path from "node:path";
import { createCanvas } from "canvas";
import sharp from "sharp";
import { renderBurnApng, renderShinyApng } from "../renderer/card-animations.js";
import { renderCardImage, type OverlayText } from "../renderer/composite-static.js";
import { fitCharacterName, lineOffset, nameLimits } from "../renderer/name-fit.js";
import { loadFrame, type TextStyle } from "../utils/frames.js";
import { cardCacheFile, dyeCacheKey, ensureDir, printCacheKey, variantArtPath } from "../utils/paths.js";
import type { Quality } from "./balance.js";
import { GameError } from "./errors.js";

export type CardImageKind = "normal" | "shiny" | "burn";

export type CardImageRequest = {
  variantId: string;
  seriesSlug: string;
  characterSlug: string;
  imageFile: string;
  characterName: string;
  frameId: number;
  printNumber: number | null;
  dye: string | null;
  kind: CardImageKind;
};

const FILE_NAME: Record<CardImageKind, "normal.png" | "shiny.apng" | "burn.apng"> = {
  normal: "normal.png",
  shiny: "shiny.apng",
  burn: "burn.apng",
};

export function visualKind(quality: Quality, dye: string | null, burn = false): CardImageKind {
  if (burn) return "burn";
  if (dye || quality === "LEGENDARY") return "shiny";
  return "normal";
}

function withText(style: TextStyle | null, text: string): OverlayText | null {
  if (!style || !text) return null;
  return { ...style, text };
}

let measureContext: ReturnType<ReturnType<typeof createCanvas>["getContext"]> | null = null;

function measureName(text: string, fontSize: number, family: string, bold: boolean): number {
  if (!measureContext) measureContext = createCanvas(1, 1).getContext("2d");
  measureContext.font = `${bold ? "700" : "400"} ${fontSize}px ${family}, sans-serif`;
  return Math.ceil(measureContext.measureText(text).width);
}

function nameLines(style: TextStyle, name: string, width: number, height: number, print: TextStyle | null): OverlayText[] {
  const family = style.fontFamily.replace(/-Bold|-Regular/gi, "") || "sans-serif";
  const bold = /bold/i.test(style.fontFamily);
  const limits = nameLimits(style, print, width, height);
  const fitted = fitCharacterName({
    name,
    fontSize: style.fontSize,
    maxWidth: limits.maxWidth,
    maxHeight: limits.maxHeight,
    measure: (text, size) => measureName(text, size, family, bold),
  });
  return fitted.map((line, index) => ({
    ...style,
    text: line.text,
    fontSize: line.fontSize,
    y: style.y + lineOffset(style.verticalAnchor, index, fitted.length, line.fontSize),
  }));
}

export async function ensureCardImage(request: CardImageRequest): Promise<string> {
  const printKey = printCacheKey(request.printNumber);
  const dyeKey = dyeCacheKey(request.dye);
  const fileName = FILE_NAME[request.kind];
  const cachePath = cardCacheFile({
    variantId: request.variantId,
    frameId: request.frameId,
    printKey,
    dyeKey,
    fileName,
  });
  if (fs.existsSync(cachePath)) return cachePath;

  const artPath = variantArtPath(request.seriesSlug, request.characterSlug, request.imageFile);
  if (!fs.existsSync(artPath)) {
    throw new GameError("missing-art", "Akira knows that card, but the artwork is missing on disk.");
  }
  const frame = loadFrame(request.frameId);
  if (!frame) {
    throw new GameError("missing-frame", "Akira is missing the frame artwork for that card.");
  }

  const texts: OverlayText[] = [];
  if (frame.characterName && request.characterName.trim()) {
    const meta = await sharp(frame.imagePath).metadata();
    texts.push(
      ...nameLines(
        frame.characterName,
        request.characterName,
        meta.width ?? 0,
        meta.height ?? 0,
        frame.printNumber,
      ),
    );
  }
  if (request.printNumber !== null) {
    const print = withText(frame.printNumber, `#${request.printNumber}`);
    if (print) texts.push(print);
  }

  const still = await renderCardImage(artPath, frame.imagePath, texts);
  const output = request.kind === "shiny"
    ? await renderShinyApng(still)
    : request.kind === "burn"
      ? await renderBurnApng(still)
      : still;

  ensureDir(path.dirname(cachePath));
  const temporary = `${cachePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, output);
  fs.renameSync(temporary, cachePath);
  return cachePath;
}
