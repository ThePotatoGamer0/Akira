import fs from "node:fs";
import path from "node:path";
import { threadId } from "node:worker_threads";
import { createCanvas } from "canvas";
import sharp from "sharp";
import {
  encodeAnimation,
  renderBurnOutputs,
  renderShinyOutputs,
  SHINE_DELAY_MS,
  shineBase,
  shineStripFrames,
  shineStrips,
  SHINE_TILE,
  type AnimationFormat,
  type EncodedAnimation,
} from "../renderer/card-animations.js";
import { renderCardImage, type OverlayText } from "../renderer/composite-static.js";
import { fitCharacterName, fitSingleLine, lineOffset, nameLimits } from "../renderer/name-fit.js";
import { loadFrame, type FrameAsset, type TextStyle } from "../utils/frames.js";
import { cardCacheFile, dyeCacheKey, ensureDir, printCacheKey, variantArtPath, type CardCacheFileName } from "../utils/paths.js";
import type { ShineThreads } from "../farm/shine-pool.js";
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

export function writeCardCacheFile(cachePath: string, output: Buffer): void {
  ensureDir(path.dirname(cachePath));
  const temporary = `${cachePath}.${process.pid}.${threadId}.tmp`;
  fs.writeFileSync(temporary, output);
  fs.renameSync(temporary, cachePath);
}

export function cacheFileName(kind: CardImageKind, format: CardAnimationFormat): CardCacheFileName {
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

/** The next label under this one. A label above the name does not limit how tall the name can grow. */
function closestBelow(origin: TextStyle, candidates: Array<TextStyle | null>): TextStyle | null {
  let best: TextStyle | null = null;
  for (const candidate of candidates) {
    if (!candidate || candidate.y <= origin.y) continue;
    if (!best || candidate.y < best.y) best = candidate;
  }
  return best;
}

function nameLines(style: TextStyle, name: string, width: number, height: number, print: TextStyle | null): OverlayText[] {
  const family = familyOf(style);
  const bold = /bold/i.test(style.fontFamily);
  const limits = nameLimits(style, print, width, height);
  const fitted = fitCharacterName({
    name,
    fontSize: style.fontSize,
    maxWidth: limits.maxWidth,
    maxHeight: style.grow ? limits.maxHeight : Math.min(limits.maxHeight, style.fontSize),
    measure: (text, size) => measureName(text, size, family, bold),
  });
  return fitted.map((line, index) => ({
    ...style,
    text: line.text,
    fontSize: line.fontSize,
    y: style.y + lineOffset(style.verticalAnchor, index, fitted.length, line.fontSize),
  }));
}

export type CardImageFile = { kind: CardImageKind; format: CardAnimationFormat };

function stillCachePath(request: Omit<CardImageRequest, "kind">): string {
  return cardCacheFile({
    variantId: request.variantId,
    frameId: request.frameId,
    printKey: printCacheKey(request.printNumber),
    dyeKey: dyeCacheKey(request.dye),
    fileName: "normal.png",
  });
}

async function composeStill(
  request: Omit<CardImageRequest, "kind">,
  artPath: string,
  frame: FrameAsset,
): Promise<Buffer> {
  const texts: OverlayText[] = [];
  const meta = await sharp(frame.imagePath).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const belowName = frame.characterName
    ? closestBelow(frame.characterName, [frame.seriesName, frame.printNumber])
    : null;
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
  return renderCardImage(artPath, frame.imagePath, texts, { ambient: frame.ambient });
}

function formatsFor(files: CardImageFile[], kind: CardImageKind): CardAnimationFormat[] {
  const seen = new Set<CardAnimationFormat>();
  const formats: CardAnimationFormat[] = [];
  for (const file of files) {
    if (file.kind !== kind || seen.has(file.format)) continue;
    seen.add(file.format);
    formats.push(file.format);
  }
  return formats;
}

export type CardRenderSources = {
  artPath: string;
  frame: FrameAsset;
  /** When false, the still is always drawn again. Farm work uses that. */
  reuseStill?: boolean;
  /**
   * A side thread that can write the shine's APNG while this one encodes its GIF.
   * Farm work starts a few, since the shine is the same work every card does.
   */
  shineThreads?: ShineThreads;
};

export type RenderedCardFile = { fileName: CardCacheFileName; data: Buffer };

/** Draw the still once, then encode each requested animation from that same picture. */
export async function renderCardFiles(
  request: Omit<CardImageRequest, "kind">,
  files: CardImageFile[],
  sources?: CardRenderSources,
): Promise<RenderedCardFile[]> {
  if (files.length === 0) return [];

  const artPath = sources?.artPath ?? variantArtPath(request.seriesSlug, request.characterSlug, request.imageFile);
  if (!fs.existsSync(artPath)) {
    throw new GameError("missing-art", "Akira knows that card, but the artwork is missing on disk.");
  }
  const frame = sources?.frame ?? loadFrame(request.frameId);
  if (!frame) {
    throw new GameError("missing-frame", "Akira is missing the frame artwork for that card.");
  }

  const stillPath = stillCachePath(request);
  const reuseStill = sources?.reuseStill !== false;
  const outputs: RenderedCardFile[] = [];
  let still: Buffer;
  if (reuseStill && fs.existsSync(stillPath)) {
    still = fs.readFileSync(stillPath);
  } else {
    still = await composeStill(request, artPath, frame);
    outputs.push({ fileName: "normal.png", data: still });
  }

  const shiny = formatsFor(files, "shiny");
  if (shiny.length > 0) {
    const encoded = sources?.shineThreads
      ? await renderShinyOnThreads(still, shiny, sources.shineThreads)
      : await renderShinyOutputs(still, shiny);
    if (encoded.gif) outputs.push({ fileName: "shiny.gif", data: encoded.gif });
    if (encoded.apng) outputs.push({ fileName: "shiny.apng", data: encoded.apng });
  }
  const burn = formatsFor(files, "burn");
  if (burn.length > 0) {
    const encoded = await renderBurnOutputs(still, burn);
    if (encoded.gif) outputs.push({ fileName: "burn.gif", data: encoded.gif });
    if (encoded.apng) outputs.push({ fileName: "burn.apng", data: encoded.apng });
  }
  return outputs;
}

/**
 * The shine with its strips drawn on the side threads and its pages written to
 * APNG there too. What comes back on this thread is the GIF's own pages, so the
 * GIF starts as soon as the strips hand theirs over.
 */
async function renderShinyOnThreads(
  still: Buffer,
  formats: AnimationFormat[],
  threads: ShineThreads,
): Promise<EncodedAnimation> {
  const { rgba, width, height } = await shineBase(still);
  const page = width * height * 4;
  const strips = shineStrips();
  let count = 0;
  for (let strip = 0; strip < strips; strip++) count += shineStripFrames(strip);
  const image = Buffer.alloc(page * count);
  for (let index = 0; index < count; index++) image.set(rgba, index * page);
  const cuts = await Promise.all(Array.from({ length: strips }, (_, strip) => threads.cut({
    strip,
    rgba,
    width,
    height,
    apng: formats.includes("apng"),
    delayMs: SHINE_DELAY_MS,
  })));
  cuts.forEach((cut, strip) => cut.image.copy(image, strip * SHINE_TILE * page, 0, page * shineStripFrames(strip)));
  return encodeAnimation({ image, width, height, frameCount: count, delays: delaysFor(count) }, formats, cuts[0]?.apng ? Promise.resolve(cuts[0].apng) : undefined);
}

function delaysFor(count: number): number[] {
  return Array.from({ length: count }, () => SHINE_DELAY_MS);
}

export async function writeCardImages(
  request: Omit<CardImageRequest, "kind">,
  files: CardImageFile[],
  sources?: CardRenderSources,
): Promise<void> {
  for (const file of await renderCardFiles(request, files, sources)) {
    writeCardCacheFile(cardCacheFile({
      variantId: request.variantId,
      frameId: request.frameId,
      printKey: printCacheKey(request.printNumber),
      dyeKey: dyeCacheKey(request.dye),
      fileName: file.fileName,
    }), file.data);
  }
}

export async function ensureCardImage(request: CardImageRequest, format: CardAnimationFormat = "gif"): Promise<string> {
  const cachePath = cardCacheFile({
    variantId: request.variantId,
    frameId: request.frameId,
    printKey: printCacheKey(request.printNumber),
    dyeKey: dyeCacheKey(request.dye),
    fileName: cacheFileName(request.kind, format),
  });
  if (fs.existsSync(cachePath)) return cachePath;
  await writeCardImages(request, [{ kind: request.kind, format }]);
  return cachePath;
}
