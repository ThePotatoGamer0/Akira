import { readFileSync } from "node:fs";
import sharp from "sharp";
import { writeApng } from "../utils/apng-write.js";
import { encodeGifImage } from "../utils/gif.js";
import { encodeClearedGif } from "../utils/gif-fast.js";
import { pngBufferToRgba } from "./frames-to-rgba.js";

type AnimationFrames = {
  /** Every page, one after another, in the order libvips reads an animated GIF. */
  image: Buffer;
  width: number;
  height: number;
  delays: number[];
  frameCount: number;
};

export const SHINE_FRAMES = 32;
export const SHINE_DELAY_MS = 55;

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

const SHINE_HALF = 0.08;
const SHINE_CORE_HALF = 0.022;

function shineCenter(progress: number): number {
  return -0.2 + progress * 2.4;
}

/** Light colour of the shine band, before the card's own transparency dims it. */
function forEachShinePixel(
  width: number,
  height: number,
  progress: number,
  visit: (x: number, y: number, lightR: number, lightG: number, lightB: number) => void,
): void {
  const center = shineCenter(progress);
  const xDenom = width <= 1 ? 1 : width - 1;
  for (let y = 0; y < height; y++) {
    const v = height <= 1 ? 0 : y / (height - 1);
    const uLow = center - SHINE_HALF - v;
    const uHigh = center + SHINE_HALF - v;
    let x0 = Math.floor(uLow * xDenom) - 1;
    let x1 = Math.ceil(uHigh * xDenom) + 1;
    if (x0 < 0) x0 = 0;
    if (x1 >= width) x1 = width - 1;
    if (x0 > x1) continue;
    for (let x = x0; x <= x1; x++) {
      const u = width <= 1 ? 0 : x / xDenom;
      const dist = u + v - center;
      const abs = Math.abs(dist);
      if (abs >= SHINE_HALF) continue;
      const glow = Math.cos((abs / SHINE_HALF) * Math.PI * 0.5) ** 2;
      const core = abs >= SHINE_CORE_HALF ? 0 : Math.cos((abs / SHINE_CORE_HALF) * Math.PI * 0.5) ** 2;
      const [prismR, prismG, prismB] = shinePrism((dist / SHINE_HALF + 1) / 2);
      const fringe = glow * (1 - core * 0.85);
      visit(
        x,
        y,
        Math.min(255, prismR * fringe * 0.7 + 255 * core * 0.92),
        Math.min(255, prismG * fringe * 0.7 + 255 * core * 0.92),
        Math.min(255, prismB * fringe * 0.7 + 255 * core * 0.92),
      );
    }
  }
}

type ShineStamp = {
  x: Uint16Array;
  y: Uint16Array;
  r: Uint8Array;
  g: Uint8Array;
  b: Uint8Array;
};

type ShineOverlay = {
  frames: ShineStamp[];
};

const shineOverlays = new Map<string, ShineOverlay>();

/** The moving shine, built once per card size and screened onto every mint. */
function shineOverlay(width: number, height: number): ShineOverlay {
  const key = `${width}x${height}`;
  const cached = shineOverlays.get(key);
  if (cached) return cached;
  const frames: ShineStamp[] = [];
  for (let i = 0; i < SHINE_FRAMES; i++) {
    const xs: number[] = [];
    const ys: number[] = [];
    const rs: number[] = [];
    const gs: number[] = [];
    const bs: number[] = [];
    forEachShinePixel(width, height, i / SHINE_FRAMES, (x, y, lightR, lightG, lightB) => {
      xs.push(x);
      ys.push(y);
      rs.push(Math.round(lightR));
      gs.push(Math.round(lightG));
      bs.push(Math.round(lightB));
    });
    frames.push({
      x: Uint16Array.from(xs),
      y: Uint16Array.from(ys),
      r: Uint8Array.from(rs),
      g: Uint8Array.from(gs),
      b: Uint8Array.from(bs),
    });
  }
  const overlay = { frames };
  shineOverlays.set(key, overlay);
  return overlay;
}

function screenStamp(
  out: Buffer,
  outWidth: number,
  originX: number,
  originY: number,
  stamp: ShineStamp,
): void {
  for (let i = 0; i < stamp.x.length; i++) {
    const pixel = ((originY + (stamp.y[i] ?? 0)) * outWidth + originX + (stamp.x[i] ?? 0)) * 4;
    const alpha = out[pixel + 3] ?? 0;
    if (alpha === 0) continue;
    const cover = alpha / 255;
    out[pixel] = screenChannel(out[pixel] ?? 0, Math.min(255, (stamp.r[i] ?? 0) * cover));
    out[pixel + 1] = screenChannel(out[pixel + 1] ?? 0, Math.min(255, (stamp.g[i] ?? 0) * cover));
    out[pixel + 2] = screenChannel(out[pixel + 2] ?? 0, Math.min(255, (stamp.b[i] ?? 0) * cover));
  }
}

/**
 * Screen one cached shine frame onto a card. `outWidth` is the buffer's stride,
 * so the same overlay can land on a card or on that card's place in a drop strip.
 */
export function blendShineOverlay(
  out: Buffer,
  outWidth: number,
  originX: number,
  originY: number,
  cardWidth: number,
  cardHeight: number,
  frameIndex: number,
): void {
  const stamp = shineOverlay(cardWidth, cardHeight).frames[frameIndex];
  if (!stamp) return;
  screenStamp(out, outWidth, originX, originY, stamp);
}

/**
 * One frame of a holographic shine. `progress` moves a diagonal band from the
 * top-left corner toward the bottom-right. The band screens the art brighter,
 * with a white core and a prismatic fringe.
 */
export function paintCardShine(rgba: Buffer, width: number, height: number, progress: number): Buffer {
  const out = Buffer.from(rgba);
  forEachShinePixel(width, height, progress, (x, y, lightR, lightG, lightB) => {
    const pixel = (y * width + x) * 4;
    const alpha = out[pixel + 3] ?? 0;
    if (alpha === 0) return;
    const cover = alpha / 255;
    out[pixel] = screenChannel(out[pixel] ?? 0, Math.min(255, lightR * cover));
    out[pixel + 1] = screenChannel(out[pixel + 1] ?? 0, Math.min(255, lightG * cover));
    out[pixel + 2] = screenChannel(out[pixel + 2] ?? 0, Math.min(255, lightB * cover));
  });
  return out;
}

/** One frame of the shine, screened onto a copy of the card. */
export type Patch = { pixels: Buffer };

/** How many frames one strip of shine holds. */
export const SHINE_TILE = 8;

/** The frame a strip starts at. Strips cover the shine in order. */
export function shineStripStart(strip: number): number {
  return Math.min(strip * SHINE_TILE, SHINE_FRAMES);
}

/** How many strips the shine has. */
export function shineStrips(): number {
  return Math.ceil(SHINE_FRAMES / SHINE_TILE);
}

/** How many frames a strip holds. The last strip holds the remainder. */
export function shineStripFrames(strip: number): number {
  return Math.max(0, Math.min(SHINE_FRAMES, (strip + 1) * SHINE_TILE) - shineStripStart(strip));
}

/** The strip's frames, each screened onto its own copy of the card. */
export function shinePatches(rgba: Buffer, width: number, height: number, strip: number): Patch[] {
  const patches: Patch[] = [];
  const start = shineStripStart(strip);
  for (let i = start; i < Math.min(SHINE_FRAMES, start + SHINE_TILE); i++) {
    const frame = Buffer.from(rgba);
    blendShineOverlay(frame, width, 0, 0, width, height, i);
    patches.push({ pixels: frame });
  }
  return patches;
}

/**
 * Write one strip of shine over a block of pages. The block starts as the card,
 * which is what the shine's first frame is too, so every strip can start from
 * page 0 and the blocks are the pages' prefixes. Each frame after the first is
 * the one before it with the band that moved on.
 */
export function layShineStrip(image: Buffer, width: number, height: number, block: number, patches: Patch[]): void {
  const page = width * height * 4;
  const first = patches[0];
  if (!first) return;
  const base = block * SHINE_TILE * page;
  image.set(first.pixels, base);
  for (let step = 1; step < patches.length; step++) {
    const target = base + step * page;
    image.copy(image, target, base, target);
    patches[step]!.pixels.copy(image, target);
  }
}

/**
 * The shine's pages, built without their strips. Empty pages are the card, so
 * a strip's block begins as the card. The farm fills the strips on other
 * threads instead of calling this.
 */
function buildShinyFrames(rgba: Buffer, width: number, height: number): AnimationFrames {
  const page = width * height * 4;
  const image = Buffer.alloc(page * SHINE_FRAMES);
  for (let index = 0; index < SHINE_FRAMES; index++) image.set(rgba, index * page);
  const delays: number[] = [];
  for (let i = 0; i < SHINE_FRAMES; i++) delays.push(SHINE_DELAY_MS);
  for (let strip = 0; strip < shineStrips(); strip++) layShineStrip(image, width, height, strip, shinePatches(rgba, width, height, strip));
  return { image, width, height, delays, frameCount: SHINE_FRAMES };
}

export type AnimationFormat = "gif" | "apng";

export type EncodedAnimation = {
  gif?: Buffer;
  apng?: Buffer;
};

export async function encodeAnimation(built: AnimationFrames, formats: AnimationFormat[], apng?: Promise<Buffer>): Promise<EncodedAnimation> {
  const out: EncodedAnimation = {};
  if (formats.length === 0) return out;
  if (built.frameCount === 0) throw new Error("animation: no frames");
  if (formats.includes("gif")) {
    out.gif = await encodeGifImage(built.image, built.width, built.height, built.frameCount, built.delays);
  }
  if (formats.includes("apng")) {
    out.apng = await (apng ?? Promise.resolve(writeApng(built.image, built.width, built.height, built.frameCount, built.delays)));
  }
  return out;
}



/**
 * The page a card holds when a strip is cut. A strip`s first page is the card,
 * so every strip can start from page 0 and the blocks are the pages` prefixes.
 */
export async function shineBase(base: Buffer): Promise<{ rgba: Buffer; width: number; height: number }> {
  const meta = await sharp(base).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) throw new Error("shiny: invalid dimensions");
  return { rgba: await pngBufferToRgba(base, width, height), width, height };
}

/** One shine pass, then however many encodings were asked for. A caller that
 * writes the APNG in another thread passes that promise in.
 */
export async function renderShinyOutputs(
  base: Buffer,
  formats: AnimationFormat[],
  apng?: Promise<Buffer>,
): Promise<EncodedAnimation> {
  if (formats.length === 0) return {};
  const { rgba, width, height } = await shineBase(base);
  return encodeAnimation(buildShinyFrames(rgba, width, height), formats, apng);
}

export async function renderShinyGif(base: Buffer): Promise<Buffer> {
  const gif = (await renderShinyOutputs(base, ["gif"])).gif;
  if (!gif) throw new Error("shiny gif was not encoded");
  return gif;
}

export async function renderShinyApng(base: Buffer): Promise<Buffer> {
  const apng = (await renderShinyOutputs(base, ["apng"])).apng;
  if (!apng) throw new Error("shiny apng was not encoded");
  return apng;
}

export const BURN_STEPS = 40;
export const BURN_FADE_STEPS = 16;
export const BURN_DELAY_MS = 110;
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

/** Loaded once at startup. Generating this table is a long loop, so the file is shipped with the bot. */
function loadBlueNoise(): Float32Array {
  const count = BLUE_SIZE * BLUE_SIZE;
  try {
    const bytes = readFileSync(new URL("./blue-noise.bin", import.meta.url));
    if (bytes.byteLength === count * 4) {
      const copy = Buffer.from(bytes);
      return new Float32Array(copy.buffer, copy.byteOffset, count);
    }
  } catch {
    // Fall through and build the table if the file is missing.
  }
  return makeBlueNoise(BLUE_SIZE);
}

const blueNoise = loadBlueNoise();

function blueThreshold(x: number, y: number): number {
  return blueNoise[(y % BLUE_SIZE) * BLUE_SIZE + (x % BLUE_SIZE)] ?? 0.5;
}

/**
 * Where the flame sits on each pixel. It does not move between frames, so a burn
 * builds it once. The two noise fields are only sampled every sixteenth of a
 * pixel, which is far finer than noise this soft can show, and the field is the
 * same card size on every card, so it is built once for the whole process.
 */
const flameEdges = new Map<number, Float32Array>();

function flameEdge(width: number, height: number): Float32Array {
  const cached = flameEdges.get(width * 65536 + height);
  if (cached) return cached;
  const edge = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const v = height <= 1 ? 0 : y / (height - 1);
    const noiseY = y * 16;
    for (let x = 0; x < width; x++) {
      const u = width <= 1 ? 0 : x / (width - 1);
      const noiseX = x * 16;
      const wander = (valueNoise(noiseX, noiseY, 36 * 16) - 0.5) * 0.22 + (valueNoise(noiseX + 120 * 16, noiseY, 14 * 16) - 0.5) * 0.07;
      edge[y * width + x] = (u + v) * 0.5 + wander;
    }
  }
  flameEdges.set(width * 65536 + height, edge);
  return edge;
}

/** Flame front that starts in the top-left and eats the card toward the bottom-right. */
export function paintCornerBurn(
  rgba: Buffer,
  width: number,
  height: number,
  progress: number,
  edge?: Float32Array,
): Buffer {
  const field = edge ?? flameEdge(width, height);
  const out = Buffer.from(rgba);
  const front = -0.08 + smoothstep(progress) * 1.35;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = (y * width + x) * 4;
      if ((out[pixel + 3] ?? 0) === 0) continue;
      const ahead = (field[y * width + x] ?? 0) - front;
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

/**
 * The grain a fade shows, per pixel. Every frame of a fade compares the same
 * pixel against its threshold, so the grain is laid out once per card size.
 */
export type FadeGrain = { width: number; height: number; threshold: Float32Array };

export function fadeGrain(width: number, height: number): FadeGrain {
  const threshold = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) threshold[y * width + x] = blueThreshold(x, y);
  }
  return { width, height, threshold };
}

/** Bring the intact card back. GIF transparency is on or off, so the fade is blue-noise grain. */
export function ditherCardFade(rgba: Buffer, width: number, height: number, amount: number, grain = fadeGrain(width, height)): Buffer {
  if (amount >= 1) return Buffer.from(rgba);
  const out = Buffer.from(rgba);
  const shown = smoothstep(amount);
  const ember = (1 - shown) * 0.35;
  const [emberR, emberG, emberB] = emberColor(0.25);
  const threshold = grain.threshold;
  for (let at = 0; at < width * height; at++) {
    const pixel = at * 4;
    const srcA = out[pixel + 3] ?? 0;
    if (srcA === 0) continue;
    if (srcA * shown < (threshold[at] ?? 0) * 255) {
      out[pixel + 3] = 0;
      continue;
    }
    if (shown < 0.8) {
      out[pixel] = Math.round((out[pixel] ?? 0) + (emberR - (out[pixel] ?? 0)) * ember);
      out[pixel + 1] = Math.round((out[pixel + 1] ?? 0) + (emberG - (out[pixel + 1] ?? 0)) * ember);
      out[pixel + 2] = Math.round((out[pixel + 2] ?? 0) + (emberB - (out[pixel + 2] ?? 0)) * ember);
    }
    out[pixel + 3] = 255;
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
  const edge = flameEdge(width, height);
  const grain = fadeGrain(width, height);
  const total = BURN_STEPS + BURN_FADE_STEPS;
  const page = width * height * 4;
  const image = Buffer.alloc(page * total);
  const delays: number[] = [];
  const put = (index: number, frame: Buffer) => {
    frame.copy(image, index * page);
    delays.push(BURN_DELAY_MS);
  };
  for (let i = 0; i < BURN_STEPS; i++) {
    put(i, paintCornerBurn(rgba, width, height, i / (BURN_STEPS - 1), edge));
  }
  for (let i = 1; i <= BURN_FADE_STEPS; i++) {
    put(BURN_STEPS + i - 1, ditherCardFade(rgba, width, height, i / BURN_FADE_STEPS, grain));
  }
  return { image, width, height, delays, frameCount: total };
}

/**
 * A burn only adds to the cleared area, so its GIF is written from the changes
 * between frames. That keeps each page small and skips quantizing 46 full cards.
 */
async function encodeBurn(built: AnimationFrames, formats: AnimationFormat[], apng?: Promise<Buffer>): Promise<EncodedAnimation> {
  const out: EncodedAnimation = {};
  if (formats.includes("gif")) {
    const page = built.width * built.height * 4;
    const first = built.image.subarray(0, page);
    out.gif = await encodeClearedGif(first, built.width, built.height, built.image, built.frameCount, built.delays);
  }
  if (formats.includes("apng")) {
    out.apng = await (apng ?? Promise.resolve(writeApng(built.image, built.width, built.height, built.frameCount, built.delays)));
  }
  return out;
}

/**
 * One burn pass, then however many encodings were asked for. A caller that
 * writes the APNG in another thread passes that promise in.
 */
export async function renderBurnOutputs(
  base: Buffer,
  formats: AnimationFormat[],
  apng?: Promise<Buffer>,
): Promise<EncodedAnimation> {
  if (formats.length === 0) return {};
  return encodeBurn(await buildBurnFrames(base), formats, apng);
}

export async function renderBurnGif(base: Buffer): Promise<Buffer> {
  const gif = (await renderBurnOutputs(base, ["gif"])).gif;
  if (!gif) throw new Error("burn gif was not encoded");
  return gif;
}

export async function renderBurnApng(base: Buffer): Promise<Buffer> {
  const apng = (await renderBurnOutputs(base, ["apng"])).apng;
  if (!apng) throw new Error("burn apng was not encoded");
  return apng;
}
