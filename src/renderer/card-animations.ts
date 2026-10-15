import sharp from "sharp";
import { encodeApng } from "../utils/apng.js";
import { encodeGif } from "../utils/gif.js";
import { pngBufferToRgba } from "./frames-to-rgba.js";

type AnimationFrames = {
  frames: Buffer[];
  width: number;
  height: number;
  delays: number[];
};

const SHINE_FRAMES = 32;
const SHINE_DELAY_MS = 55;

/** Magenta, gold, cyan, then violet across the shine band. */
export function shinePrism(hue: number): [number, number, number] {
  const stops: Array<[number, number, number]> = [
    [255, 70, 200],
    [255, 210, 70],
    [70, 230, 255],
    [160, 90, 255],
  ];
  const scaled = Math.min(0.999, Math.max(0, hue)) * (stops.length - 1);
  const index = Math.floor(scaled);
  const mix = scaled - index;
  const from = stops[index] ?? stops[0]!;
  const to = stops[index + 1] ?? from;
  return [
    from[0] + (to[0] - from[0]) * mix,
    from[1] + (to[1] - from[1]) * mix,
    from[2] + (to[2] - from[2]) * mix,
  ];
}

function screenChannel(base: number, light: number): number {
  return Math.round(255 - ((255 - base) * (255 - light)) / 255);
}

/**
 * One frame of a holographic shine. `progress` moves a diagonal band from the
 * top-left corner toward the bottom-right. The band screens the art brighter,
 * with a white core and a prismatic fringe.
 */
export function paintCardShine(rgba: Buffer, width: number, height: number, progress: number): Buffer {
  const out = Buffer.from(rgba);
  const center = -0.2 + progress * 2.4;
  const half = 0.08;
  const coreHalf = 0.022;
  for (let y = 0; y < height; y++) {
    const v = height <= 1 ? 0 : y / (height - 1);
    for (let x = 0; x < width; x++) {
      const u = width <= 1 ? 0 : x / (width - 1);
      const dist = u + v - center;
      const abs = Math.abs(dist);
      if (abs >= half) continue;
      const pixel = (y * width + x) * 4;
      const alpha = out[pixel + 3] ?? 0;
      if (alpha === 0) continue;
      const cover = alpha / 255;
      const glow = Math.cos((abs / half) * Math.PI * 0.5) ** 2;
      const core = abs >= coreHalf ? 0 : Math.cos((abs / coreHalf) * Math.PI * 0.5) ** 2;
      const [prismR, prismG, prismB] = shinePrism((dist / half + 1) / 2);
      const fringe = glow * (1 - core * 0.85);
      const lightR = Math.min(255, (prismR * fringe * 0.7 + 255 * core * 0.92) * cover);
      const lightG = Math.min(255, (prismG * fringe * 0.7 + 255 * core * 0.92) * cover);
      const lightB = Math.min(255, (prismB * fringe * 0.7 + 255 * core * 0.92) * cover);
      out[pixel] = screenChannel(out[pixel] ?? 0, lightR);
      out[pixel + 1] = screenChannel(out[pixel + 1] ?? 0, lightG);
      out[pixel + 2] = screenChannel(out[pixel + 2] ?? 0, lightB);
    }
  }
  return out;
}

/** Diagonal shine that crosses the card, then loops once it has left the frame. */
async function buildShinyFrames(base: Buffer): Promise<AnimationFrames> {
  const meta = await sharp(base).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) throw new Error("shiny: invalid dimensions");

  const rgba = await pngBufferToRgba(base, width, height);
  const frames: Buffer[] = [];
  const delays: number[] = [];
  for (let i = 0; i < SHINE_FRAMES; i++) {
    frames.push(paintCardShine(rgba, width, height, i / SHINE_FRAMES));
    delays.push(SHINE_DELAY_MS);
  }
  return { frames, width, height, delays };
}

export async function renderShinyGif(base: Buffer): Promise<Buffer> {
  const built = await buildShinyFrames(base);
  return encodeGif(built.frames, built.width, built.height, built.delays);
}

export async function renderShinyApng(base: Buffer): Promise<Buffer> {
  const built = await buildShinyFrames(base);
  return encodeApng(built.frames, built.width, built.height, built.delays);
}

/** burn.gif structure: fade in → flames up → fade out → loop (10 frames). */
async function buildBurnFrames(base: Buffer): Promise<AnimationFrames> {
  const meta = await sharp(base).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) throw new Error("burn: invalid dimensions");

  const frames: Buffer[] = [];
  const delays: number[] = [];

  for (let i = 1; i <= 3; i++) {
    const a = i / 3;
    const buf = await sharp(base).ensureAlpha().png().toBuffer();
    const rgba = await pngBufferToRgba(buf, w, h);
    for (let p = 0; p < rgba.length; p += 4) {
      rgba[p + 3] = Math.round(rgba[p + 3]! * a);
    }
    frames.push(rgba);
    delays.push(80);
  }

  for (let i = 4; i <= 8; i++) {
    const rise = (i - 4) / 4;
    const flame = await sharp({
      create: {
        width: w,
        height: h,
        channels: 4,
        background: { r: 255, g: 120 + rise * 80, b: 40, alpha: 0.35 + rise * 0.35 },
      },
    })
      .png()
      .toBuffer();
    const buf = await sharp(base)
      .composite([{ input: flame, blend: "screen", top: Math.round(-rise * h * 0.35), left: 0 }])
      .png()
      .toBuffer();
    frames.push(await pngBufferToRgba(buf, w, h));
    delays.push(90);
  }

  for (let i = 9; i <= 10; i++) {
    const a = 1 - (i - 9) / 2;
    const buf = await sharp(base).ensureAlpha().png().toBuffer();
    const rgba = await pngBufferToRgba(buf, w, h);
    for (let p = 0; p < rgba.length; p += 4) {
      rgba[p + 3] = Math.round(rgba[p + 3]! * a);
    }
    frames.push(rgba);
    delays.push(100);
  }

  return { frames, width: w, height: h, delays };
}

export async function renderBurnGif(base: Buffer): Promise<Buffer> {
  const built = await buildBurnFrames(base);
  return encodeGif(built.frames, built.width, built.height, built.delays);
}

export async function renderBurnApng(base: Buffer): Promise<Buffer> {
  const built = await buildBurnFrames(base);
  return encodeApng(built.frames, built.width, built.height, built.delays);
}
