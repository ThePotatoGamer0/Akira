import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import UPNG from "upng-js";
import { encodeApng } from "../utils/apng.js";
import { DROP_STRIP_GAP, renderDropStrip } from "./drop-strip.js";

async function solid(width: number, height: number, color: { r: number; g: number; b: number }): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: color },
  })
    .png()
    .toBuffer();
}

test("a still drop is one png three cards wide", async () => {
  const strip = await renderDropStrip([
    { image: await solid(2, 4, { r: 255, g: 0, b: 0 }), animated: false },
    { image: await solid(2, 4, { r: 0, g: 255, b: 0 }), animated: false },
    { image: await solid(2, 4, { r: 0, g: 0, b: 255 }), animated: false },
  ]);
  assert.equal(strip.animated, false);
  assert.equal(strip.data[0], 0x89);
  assert.equal(strip.data[1], 0x50);
  const { data, info } = await sharp(strip.data).raw().toBuffer({ resolveWithObject: true });
  const gap = DROP_STRIP_GAP;
  assert.equal(info.width, 6 + gap * 4);
  assert.equal(info.height, 4 + gap * 2);
  assert.equal(data[0 + 3], 0);
  const red = ((gap * info.width) + gap) * info.channels;
  const green = ((gap * info.width) + gap + 2 + gap) * info.channels;
  const blue = ((gap * info.width) + gap + 2 + gap + 2 + gap) * info.channels;
  assert.equal(data[red], 255);
  assert.equal(data[red + 2], 0);
  assert.equal(data[green + 1], 255);
  assert.equal(data[blue + 2], 255);
});

test("one shiny card makes the strip an apng", async () => {
  const still = await solid(32, 32, { r: 10, g: 20, b: 30 });
  const bright = Buffer.alloc(32 * 32 * 4, 255);
  const dim = Buffer.alloc(32 * 32 * 4, 20);
  const shiny = encodeApng([bright, dim], 32, 32, [60, 80]);
  const strip = await renderDropStrip([
    { image: still, animated: false },
    { image: shiny, animated: true },
    { image: still, animated: false },
  ]);
  assert.equal(strip.animated, true);
  const bytes = strip.data.buffer.slice(strip.data.byteOffset, strip.data.byteOffset + strip.data.byteLength) as ArrayBuffer;
  const decoded = UPNG.decode(bytes);
  const gap = DROP_STRIP_GAP;
  assert.equal(decoded.width, 96 + gap * 4);
  assert.equal(decoded.height, 32 + gap * 2);
  assert.equal(decoded.frames.length, 2);
  assert.equal(decoded.frames[0]?.delay, 60);
  assert.equal(decoded.frames[1]?.delay, 80);
  const frames = UPNG.toRGBA8(decoded);
  assert.equal(frames.length, 2);
  const first = new Uint8Array(frames[0]!);
  const second = new Uint8Array(frames[1]!);
  const stillX = gap;
  const shinyX = gap + 32 + gap;
  const y = gap;
  const at = (x: number) => (y * decoded.width + x) * 4;
  assert.equal(first[at(stillX)], 10);
  assert.equal(first[at(shinyX)], 255);
  assert.equal(second[at(shinyX)], 20);
});
