import sharp from "sharp";
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

/**
 * Composite character art under a frame. Art is clipped to the frame opening
 * so it does not show through the transparent outer corners.
 */
export async function renderNormalCard(characterPngPath: string, framePngPath: string): Promise<Buffer> {
  const frameBuf = await sharp(framePngPath).ensureAlpha().png().toBuffer();
  const fm = await sharp(frameBuf).metadata();
  const fw = fm.width;
  const fh = fm.height;
  if (!fw || !fh) {
    throw new Error(`Invalid frame dimensions: ${framePngPath}`);
  }

  const frameRaw = await sharp(frameBuf).ensureAlpha().raw().toBuffer();
  const outside = outsideMask(framePngPath, fw, fh, frameRaw);
  const artRaw = await sharp(characterPngPath)
    .ensureAlpha()
    .resize(fw, fh, { fit: "contain", position: "centre", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw()
    .toBuffer();
  for (let index = 0; index < outside.length; index++) {
    if (outside[index]) artRaw[index * 4 + 3] = 0;
  }
  const clipped = await sharp(artRaw, { raw: { width: fw, height: fh, channels: 4 } }).png().toBuffer();

  return sharp(clipped)
    .composite([{ input: frameBuf, blend: "over" }])
    .png()
    .toBuffer();
}

export async function renderCardImage(
  characterPngPath: string,
  framePngPath: string,
  texts: OverlayText[],
): Promise<Buffer> {
  const base = await renderNormalCard(characterPngPath, framePngPath);
  if (texts.length === 0) return base;
  const meta = await sharp(base).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) {
    throw new Error("Composited card has no dimensions");
  }
  const svg = Buffer.from(textOverlaySvg(width, height, texts));
  return sharp(base).composite([{ input: svg, top: 0, left: 0 }]).png().toBuffer();
}
