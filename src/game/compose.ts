import fs from "node:fs";
import path from "node:path";
import { createCanvas } from "canvas";
import sharp from "sharp";
import { renderBurnApng, renderBurnGif, renderShinyApng, renderShinyGif } from "../renderer/card-animations.js";
import { renderCardImage, type OverlayText } from "../renderer/composite-static.js";
import { fitCharacterName, fitSingleLine, lineOffset, nameLimits } from "../renderer/name-fit.js";
import { loadFrame, type TextStyle } from "../utils/frames.js";
import { cardCacheFile, dyeCacheKey, ensureDir, printCacheKey, variantArtPath, type CardCacheFileName } from "../utils/paths.js";
import type { Quality } from "./balance.js";
import { GameError } from "./errors.js";

export type CardImageKind = "normal" | "shiny" | "burn";
export type CardAnimationFormat = "gif" | "apng";

export type CardImageRequest = {
  variantId: string;
  seriesSlug: string;
  characterSlug: string;
  imageFile: string;
  characterName: string;
  seriesName: string;
  frameId: number;
  printNumber: number | null;
  dye: string | null;
  kind: CardImageKind;
};

function cacheFileName(kind: CardImageKind, format: CardAnimationFormat): CardCacheFileName {
  if (kind === "normal") return "normal.png";
  if (kind === "shiny") return format === "apng" ? "shiny.apng" : "shiny.gif";
  return format === "apng" ? "burn.apng" : "burn.gif";
}

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

function familyOf(style: TextStyle): string {
  return style.fontFamily.replace(/-Bold|-Regular/gi, "") || "sans-serif";
}

function measureName(text: string, fontSize: number, family: string, bold: boolean): number {
  if (!measureContext) measureContext = createCanvas(1, 1).getContext("2d");
  measureContext.font = `${bold ? "700" : "400"} ${fontSize}px ${family}, sans-serif`;
  return Math.ceil(measureContext.measureText(text).width);
}

function nameLines(style: TextStyle, name: string, width: number, height: number, print: TextStyle | null): OverlayText[] {
  const family = familyOf(style);
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

export async function ensureCardImage(request: CardImageRequest, format: CardAnimationFormat = "gif"): Promise<string> {
  const printKey = printCacheKey(request.printNumber);
  const dyeKey = dyeCacheKey(request.dye);
  const fileName = cacheFileName(request.kind, format);
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
  const meta = await sharp(frame.imagePath).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const belowName = frame.seriesName ?? frame.printNumber;
  if (frame.characterName && request.characterName.trim()) {
    texts.push(
      ...nameLines(
        frame.characterName,
        request.characterName,
        width,
        height,
        belowName,
      ),
    );
  }
  if (frame.seriesName && request.seriesName.trim()) {
    const limits = nameLimits(frame.seriesName, frame.printNumber, width, height);
    const fitted = fitSingleLine({
      text: request.seriesName,
      fontSize: frame.seriesName.fontSize,
      maxWidth: limits.maxWidth,
      measure: (text, size) => measureName(text, size, familyOf(frame.seriesName!), /bold/i.test(frame.seriesName!.fontFamily)),
    });
    texts.push({ ...frame.seriesName, text: fitted.text, fontSize: fitted.fontSize });
  }
  if (request.printNumber !== null) {
    const print = withText(frame.printNumber, `#${request.printNumber}`);
    if (print) texts.push(print);
  }

  const still = await renderCardImage(artPath, frame.imagePath, texts, { ambient: frame.ambient });
  const output =
    request.kind === "shiny"
      ? format === "apng"
        ? await renderShinyApng(still)
        : await renderShinyGif(still)
      : request.kind === "burn"
        ? format === "apng"
          ? await renderBurnApng(still)
          : await renderBurnGif(still)
        : still;

  ensureDir(path.dirname(cachePath));
  const temporary = `${cachePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, output);
  fs.renameSync(temporary, cachePath);
  return cachePath;
}
