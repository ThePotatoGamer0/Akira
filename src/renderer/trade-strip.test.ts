import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { renderTradePair } from "./trade-strip.js";

async function solid(width: number, height: number, rgb: { r: number; g: number; b: number }): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 4, background: { ...rgb, alpha: 1 } },
  })
    .png()
    .toBuffer();
}

test("a trade image puts a magenta swap arrow between the two cards", async () => {
  const left = await solid(40, 80, { r: 220, g: 20, b: 20 });
  const right = await solid(40, 80, { r: 20, g: 20, b: 220 });
  const pair = await renderTradePair(left, right, false);
  assert.equal(pair.animated, false);
  assert.equal(pair.data.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  const { data, info } = await sharp(pair.data).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 16 + 40 + 96 + 40 + 16);
  assert.equal(info.height, 80 + 32);
  const pixel = (x: number, y: number) => {
    const index = (y * info.width + x) * 4;
    return [data[index], data[index + 1], data[index + 2], data[index + 3]];
  };
  const leftPixel = pixel(18, 18);
  const rightPixel = pixel(16 + 40 + 96 + 2, 18);
  assert.ok((leftPixel[0] ?? 0) > 200 && (leftPixel[2] ?? 0) < 40);
  assert.ok((rightPixel[2] ?? 0) > 200 && (rightPixel[0] ?? 0) < 40);
  let magenta = false;
  for (let y = 16; y < 16 + 80 && !magenta; y++) {
    for (let x = 16 + 40; x < 16 + 40 + 96; x++) {
      const [r, g, b, a] = pixel(x, y);
      if ((a ?? 0) > 180 && (r ?? 0) > 160 && (b ?? 0) > 160 && (g ?? 0) < 120) magenta = true;
    }
  }
  assert.equal(magenta, true);
});
