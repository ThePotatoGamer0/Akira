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

const BURN_STEPS = 40;
const BURN_FADE_STEPS = 16;
const BURN_DELAY_MS = 110;
const BLUE_SIZE = 128;

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function emberColor(heat: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, heat));
  if (x < 0.35) return [90 + (130 * x) / 0.35, 18 + (42 * x) / 0.35, 4 + (4 * x) / 0.35];
  if (x < 0.7) return [220 + (35 * (x - 0.35)) / 0.35, 60 + (90 * (x - 0.35)) / 0.35, 8 + (22 * (x - 0.35)) / 0.35];
  return [255, 150 + (86 * (x - 0.7)) / 0.3, 30 + (140 * (x - 0.7)) / 0.3];
}

function paintEmber(out: Buffer, pixel: number, cover: number, heat: number): void {
  const [r, g, b] = emberColor(heat);
  const mix = cover * ((out[pixel + 3] ?? 0) / 255);
  out[pixel] = Math.round((out[pixel] ?? 0) + (r - (out[pixel] ?? 0)) * mix);
  out[pixel + 1] = Math.round((out[pixel + 1] ?? 0) + (g - (out[pixel + 1] ?? 0)) * mix);
  out[pixel + 2] = Math.round((out[pixel + 2] ?? 0) + (b - (out[pixel + 2] ?? 0)) * mix);
}

function hash01(x: number, y: number): number {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x: number, y: number, scale: number): number {
  const gx = x / scale;
  const gy = y / scale;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash01(x0, y0);
  const b = hash01(x0 + 1, y0);
  const c = hash01(x0, y0 + 1);
  const d = hash01(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c + (d - c) * sx - (a + (b - a) * sx)) * sy;
}

/** Wrapping blue-noise thresholds. The grain has no tile, so a GIF fade does not show a grid. */
function makeBlueNoise(size: number): Float32Array {
  const count = size * size;
  const sigma = 1.5;
  const radius = 4;
  const kernel: number[] = [];
  for (let i = -radius; i <= radius; i++) kernel.push(Math.exp(-0.5 * (i / sigma) ** 2));

  const mask = new Uint8Array(count);
  const field = new Float32Array(count);

  function splat(index: number, sign: number, target: Float32Array, bits: Uint8Array): void {
    const x = index % size;
    const y = (index / size) | 0;
    for (let ky = -radius; ky <= radius; ky++) {
      const row = ((y + ky + size) % size) * size;
      const weightY = kernel[ky + radius] ?? 0;
      for (let kx = -radius; kx <= radius; kx++) {
        const at = row + ((x + kx + size) % size);
        target[at] = (target[at] ?? 0) + sign * weightY * (kernel[kx + radius] ?? 0);
      }
    }
    bits[index] = sign > 0 ? 1 : 0;
  }

  function extreme(wantOn: boolean, target: Float32Array, bits: Uint8Array): number {
    let best = 0;
    let bestValue = wantOn ? -Infinity : Infinity;
    for (let i = 0; i < count; i++) {
      if ((bits[i] === 1) !== wantOn) continue;
      const value = target[i] ?? 0;
      if (wantOn ? value > bestValue : value < bestValue) {
        bestValue = value;
        best = i;
      }
    }
    return best;
  }

  const order = new Uint32Array(count);
  for (let i = 0; i < count; i++) order[i] = i;
  let seed = 1;
  for (let i = count - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    const swap = order[i] ?? 0;
    order[i] = order[j] ?? 0;
    order[j] = swap;
  }
  const seeds = Math.round(count * 0.1);
  for (let i = 0; i < seeds; i++) splat(order[i] ?? 0, 1, field, mask);

  for (let iter = 0; iter < count; iter++) {
    const cluster = extreme(true, field, mask);
    splat(cluster, -1, field, mask);
    const hole = extreme(false, field, mask);
    if (hole === cluster) {
      splat(cluster, 1, field, mask);
      break;
    }
    splat(hole, 1, field, mask);
  }

  const rank = new Uint32Array(count);
  const work = mask.slice();
  const workField = Float32Array.from(field);
  for (let placed = seeds - 1; placed >= 0; placed--) {
    const cluster = extreme(true, workField, work);
    rank[cluster] = placed;
    splat(cluster, -1, workField, work);
  }
  work.set(mask);
  workField.set(field);
  for (let placed = seeds; placed < count; placed++) {
    const hole = extreme(false, workField, work);
    rank[hole] = placed;
    splat(hole, 1, workField, work);
  }

  const thresholds = new Float32Array(count);
  for (let i = 0; i < count; i++) thresholds[i] = ((rank[i] ?? 0) + 0.5) / count;
  return thresholds;
}

let blueNoise: Float32Array | null = null;

function blueThreshold(x: number, y: number): number {
  blueNoise ??= makeBlueNoise(BLUE_SIZE);
  return blueNoise[(y % BLUE_SIZE) * BLUE_SIZE + (x % BLUE_SIZE)] ?? 0.5;
}

/** Flame front that starts in the top-left and eats the card toward the bottom-right. */
export function paintCornerBurn(rgba: Buffer, width: number, height: number, progress: number): Buffer {
  const out = Buffer.from(rgba);
  const front = -0.08 + smoothstep(progress) * 1.35;
  for (let y = 0; y < height; y++) {
    const v = height <= 1 ? 0 : y / (height - 1);
    for (let x = 0; x < width; x++) {
      const pixel = (y * width + x) * 4;
      if ((out[pixel + 3] ?? 0) === 0) continue;
      const wander = (valueNoise(x, y, 36) - 0.5) * 0.22 + (valueNoise(x + 120, y, 14) - 0.5) * 0.07;
      const ahead = ((width <= 1 ? 0 : x / (width - 1)) + v) * 0.5 + wander - front;
      if (ahead < -0.015) {
        out[pixel + 3] = 0;
        continue;
      }
      if (ahead < 0.055) {
        paintEmber(out, pixel, 0.96, 1 - ahead / 0.055);
        continue;
      }
      if (ahead < 0.1) {
        const scorch = (1 - (ahead - 0.055) / 0.045) * ((out[pixel + 3] ?? 0) / 255);
        out[pixel] = Math.round((out[pixel] ?? 0) + (28 - (out[pixel] ?? 0)) * scorch);
        out[pixel + 1] = Math.round((out[pixel + 1] ?? 0) + (16 - (out[pixel + 1] ?? 0)) * scorch);
        out[pixel + 2] = Math.round((out[pixel + 2] ?? 0) + (12 - (out[pixel + 2] ?? 0)) * scorch);
      }
    }
  }
  return out;
}

/** Bring the intact card back. GIF transparency is on or off, so the fade is blue-noise grain. */
export function ditherCardFade(rgba: Buffer, width: number, height: number, amount: number): Buffer {
  if (amount >= 1) return Buffer.from(rgba);
  const out = Buffer.from(rgba);
  const shown = smoothstep(amount);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = (y * width + x) * 4;
      const srcA = out[pixel + 3] ?? 0;
      if (srcA === 0) continue;
      if ((srcA / 255) * shown < blueThreshold(x, y)) {
        out[pixel + 3] = 0;
        continue;
      }
      if (shown < 0.8) paintEmber(out, pixel, (1 - shown) * 0.35, 0.25);
      out[pixel + 3] = 255;
    }
  }
  return out;
}

/** burn.gif structure: flame from the top-left, then the card grains back in and loops. */
async function buildBurnFrames(base: Buffer): Promise<AnimationFrames> {
  const meta = await sharp(base).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) throw new Error("burn: invalid dimensions");

  const rgba = await pngBufferToRgba(base, width, height);
  const frames: Buffer[] = [];
  const delays: number[] = [];
  for (let i = 0; i < BURN_STEPS; i++) {
    frames.push(paintCornerBurn(rgba, width, height, i / (BURN_STEPS - 1)));
    delays.push(BURN_DELAY_MS);
  }
  for (let i = 1; i <= BURN_FADE_STEPS; i++) {
    frames.push(ditherCardFade(rgba, width, height, i / BURN_FADE_STEPS));
    delays.push(BURN_DELAY_MS);
  }
  return { frames, width, height, delays };
}

export async function renderBurnGif(base: Buffer): Promise<Buffer> {
  const built = await buildBurnFrames(base);
  return encodeGif(built.frames, built.width, built.height, built.delays, {
    dither: 0,
    reuse: false,
    interFrameMaxError: 0,
    effort: 7,
  });
}

export async function renderBurnApng(base: Buffer): Promise<Buffer> {
  const built = await buildBurnFrames(base);
  return encodeApng(built.frames, built.width, built.height, built.delays);
}
