import sharp from "sharp";
import { ambientField, inkForField, type AmbientInk } from "./ambient.js";
import type { TextStyle } from "../utils/frames.js";

export type OverlayText = TextStyle & { text: string };

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textAnchor(anchor: TextStyle["horizontalAnchor"]): string {
  if (anchor === "center") return "middle";
  if (anchor === "right") return "end";
  return "start";
}

function dominantBaseline(anchor: TextStyle["verticalAnchor"]): string {
  if (anchor === "center") return "central";
  if (anchor === "bottom") return "text-after-edge";
  return "hanging";
}

function fontWeight(family: string): string {
  return /bold/i.test(family) ? "700" : "400";
}

function textOverlaySvg(width: number, height: number, texts: OverlayText[]): string {
  const nodes = texts
    .map((text) => {
      const family = xmlEscape(text.fontFamily.replace(/-Bold|-Regular/gi, "") || "sans-serif");
      return `<text x="${text.x}" y="${text.y}" font-size="${text.fontSize}" font-family="${family}, sans-serif" font-weight="${fontWeight(text.fontFamily)}" fill="${xmlEscape(text.color)}" text-anchor="${textAnchor(text.horizontalAnchor)}" dominant-baseline="${dominantBaseline(text.verticalAnchor)}">${xmlEscape(text.text)}</text>`;
    })
    .join("");
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${nodes}</svg>`;
}

const maskCache = new Map<string, { width: number; height: number; outside: Uint8Array }>();

/** Transparent pixels reachable from the image edge sit outside the rounded frame. */
function outsideMask(framePath: string, width: number, height: number, raw: Buffer): Uint8Array {
  const cached = maskCache.get(framePath);
  if (cached && cached.width === width && cached.height === height) return cached.outside;

  const outside = new Uint8Array(width * height);
  const queue: number[] = [];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = y * width + x;
    if (outside[index] || (raw[index * 4 + 3] ?? 0) > 16) return;
    outside[index] = 1;
    queue.push(index);
  };
  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }
  for (let i = 0; i < queue.length; i++) {
    const index = queue[i]!;
    const x = index % width;
    const y = Math.floor(index / width);
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  maskCache.set(framePath, { width, height, outside });
  return outside;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/** The flat polaroid color, so the rim can be recolored without losing its highlight. */
function modalFill(frame: Buffer, width: number, height: number): [number, number, number] {
  const counts = new Map<number, number>();
  const pixels = width * height;
  for (let index = 0; index < pixels; index += 5) {
    if ((frame[index * 4 + 3] ?? 0) < 250) continue;
    const key = ((frame[index * 4] ?? 0) << 16) | ((frame[index * 4 + 1] ?? 0) << 8) | (frame[index * 4 + 2] ?? 0);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = 0;
  let bestCount = -1;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return [(best >> 16) & 255, (best >> 8) & 255, best & 255];
}

function paintField(frame: Buffer, field: Buffer, width: number, height: number): Buffer {
  const fill = modalFill(frame, width, height);
  const out = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index++) {
    out[index * 4] = clampByte((field[index * 3] ?? 0) + ((frame[index * 4] ?? 0) - fill[0]));
    out[index * 4 + 1] = clampByte((field[index * 3 + 1] ?? 0) + ((frame[index * 4 + 1] ?? 0) - fill[1]));
    out[index * 4 + 2] = clampByte((field[index * 3 + 2] ?? 0) + ((frame[index * 4 + 2] ?? 0) - fill[2]));
    out[index * 4 + 3] = frame[index * 4 + 3] ?? 0;
  }
  return out;
}

function withInk(texts: OverlayText[], ink: AmbientInk): OverlayText[] {
  const order = texts
    .map((text, index) => ({ index, size: text.fontSize }))
    .sort((a, b) => b.size - a.size);
  const colors = [ink.name, ink.series, ink.print];
  const chosen = new Map<number, string>();
  order.forEach((item, rank) => chosen.set(item.index, colors[Math.min(rank, colors.length - 1)] ?? ink.name));
  return texts.map((text, index) => ({ ...text, color: chosen.get(index) ?? text.color }));
}

type Opening = { minX: number; minY: number; maxX: number; maxY: number };

/** The clear window inside the polaroid, not the transparent outer corners. */
function windowOpening(outside: Uint8Array, frame: Buffer, width: number, height: number): Opening | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (outside[index] || (frame[index * 4 + 3] ?? 0) > 16) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { minX, minY, maxX, maxY };
}

/** How many clear pixels sit in the window, and how far the picture starts below the top. */
function openingGaps(art: Buffer, width: number, opening: Opening): { holes: number; topGap: number } {
  let holes = 0;
  let top = -1;
  for (let y = opening.minY; y <= opening.maxY; y++) {
    for (let x = opening.minX; x <= opening.maxX; x++) {
      if ((art[(y * width + x) * 4 + 3] ?? 0) > 16) {
        if (top < 0) top = y;
      } else {
        holes += 1;
      }
    }
  }
  return { holes, topGap: top < 0 ? 0 : top - opening.minY };
}

/** Slide the picture up so a wide portrait sits on the top of the window. */
function shiftUp(art: Buffer, width: number, height: number, dy: number): Buffer {
  if (dy <= 0) return art;
  const out = Buffer.alloc(art.length);
  for (let y = dy; y < height; y++) {
    art.copy(out, (y - dy) * width * 4, y * width * 4, (y + 1) * width * 4);
  }
  return out;
}

/**
 * Portraits that are taller or wider than the window keep every pixel.
 * The empty strip is a blur of the same picture, not a crop and not a hole.
 */
async function backedArt(artPath: string, art: Buffer, width: number, height: number, opening: Opening): Promise<Buffer> {
  const gaps = openingGaps(art, width, opening);
  if (gaps.holes < 80) return art;
  const placed = gaps.topGap > 2 ? shiftUp(art, width, height, gaps.topGap) : art;
  const wash = await sharp(artPath)
    .ensureAlpha()
    .resize(width, height, { fit: "cover", position: "centre" })
    .blur(28)
    .modulate({ brightness: 0.82 })
    .png()
    .toBuffer();
  const foreground = await sharp(placed, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const stacked = await sharp(wash).composite([{ input: foreground, blend: "over" }]).ensureAlpha().raw().toBuffer();
  return stacked;
}

/**
 * Composite character art under a frame. Art is clipped to the frame opening
 * so it does not show through the transparent outer corners.
 * An ambient frame keeps that opening and paints the polaroid from the art.
 */
export async function renderNormalCard(
  characterPngPath: string,
  framePngPath: string,
  overlayPng?: Buffer,
): Promise<Buffer> {
  const frameBuf = overlayPng ?? (await sharp(framePngPath).ensureAlpha().png().toBuffer());
  const fm = await sharp(framePngPath).metadata();
  const fw = fm.width;
  const fh = fm.height;
  if (!fw || !fh) {
    throw new Error(`Invalid frame dimensions: ${framePngPath}`);
  }

  const frameRaw = await sharp(framePngPath).ensureAlpha().raw().toBuffer();
  const outside = outsideMask(framePngPath, fw, fh, frameRaw);
  let artRaw = await sharp(characterPngPath)
    .ensureAlpha()
    .resize(fw, fh, { fit: "contain", position: "centre", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw()
    .toBuffer();
  const opening = windowOpening(outside, frameRaw, fw, fh);
  if (opening) artRaw = await backedArt(characterPngPath, artRaw, fw, fh, opening);
  for (let index = 0; index < outside.length; index++) {
    if (outside[index]) artRaw[index * 4 + 3] = 0;
  }
  const clipped = await sharp(artRaw, { raw: { width: fw, height: fh, channels: 4 } }).png().toBuffer();

  return sharp(clipped)
    .composite([{ input: frameBuf, blend: "over" }])
    .png()
    .toBuffer();
}

async function ambientOverlay(characterPngPath: string, framePngPath: string, width: number, height: number): Promise<{
  png: Buffer;
  ink: AmbientInk;
}> {
  const field = await ambientField(characterPngPath, width, height);
  const frameRaw = await sharp(framePngPath).ensureAlpha().raw().toBuffer();
  const painted = paintField(frameRaw, field, width, height);
  const png = await sharp(painted, { raw: { width, height, channels: 4 } }).png().toBuffer();
  return { png, ink: inkForField(field, width, height) };
}

export async function renderCardImage(
  characterPngPath: string,
  framePngPath: string,
  texts: OverlayText[],
  options?: { ambient?: boolean },
): Promise<Buffer> {
  const frameMeta = await sharp(framePngPath).metadata();
  const width = frameMeta.width ?? 0;
  const height = frameMeta.height ?? 0;
  if (!width || !height) {
    throw new Error(`Invalid frame dimensions: ${framePngPath}`);
  }
  const ambient = options?.ambient ? await ambientOverlay(characterPngPath, framePngPath, width, height) : null;
  const drawn = ambient && texts.length > 0 ? withInk(texts, ambient.ink) : texts;
  const base = await renderNormalCard(characterPngPath, framePngPath, ambient?.png);
  if (drawn.length === 0) return base;
  const svg = Buffer.from(textOverlaySvg(width, height, drawn));
  return sharp(base).composite([{ input: svg, top: 0, left: 0 }]).png().toBuffer();
}
