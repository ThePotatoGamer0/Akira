import sharp from "sharp";
import { encodeApng } from "../utils/apng.js";
import { renderNormalCard } from "./composite-static.js";
import { pngBufferToRgba } from "./frames-to-rgba.js";

/** Placeholder loop: subtle opacity pulse for shimmer (replace with full effect later). */
export async function renderShinyApng(characterPngPath: string, framePngPath: string): Promise<Buffer> {
  const base = await renderNormalCard(characterPngPath, framePngPath);
  const meta = await sharp(base).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) throw new Error("shiny: invalid dimensions");

  const frames: Buffer[] = [];
  const delays: number[] = [];
  const steps = 8;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const boost = 1 + 0.06 * Math.sin(t * Math.PI * 2);
    const buf = await sharp(base).linear(boost, -(boost - 1) * 32).png().toBuffer();
    frames.push(await pngBufferToRgba(buf, w, h));
    delays.push(60);
  }
  return encodeApng(frames, w, h, delays);
}

/** burn.apng structure: fade in → flames up → fade out → loop (10 frames). */
export async function renderBurnApng(characterPngPath: string, framePngPath: string): Promise<Buffer> {
  const base = await renderNormalCard(characterPngPath, framePngPath);
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

  return encodeApng(frames, w, h, delays);
}
