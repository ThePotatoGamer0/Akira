import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { encodeGif } from "../utils/gif.js";

function fill(width: number, height: number, color: [number, number, number, number]): Buffer {
  const buf = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < buf.length; offset += 4) {
    buf[offset] = color[0];
    buf[offset + 1] = color[1];
    buf[offset + 2] = color[2];
    buf[offset + 3] = color[3];
  }
  return buf;
}

test("a changed rectangle keeps its colour and the still pixels stay put", async () => {
  const width = 24;
  const height = 16;
  const first = fill(width, height, [240, 20, 20, 255]);
  const second = Buffer.from(first);
  for (let y = 4; y < 10; y++) {
    for (let x = 6; x < 14; x++) {
      const offset = (y * width + x) * 4;
      second[offset] = 20;
      second[offset + 1] = 20;
      second[offset + 2] = 220;
      second[offset + 3] = 255;
    }
  }
  first[3] = 0;
  second[3] = 0;
  const gif = await encodeGif([first, second], width, height, [60, 80], { dither: 0 });
  const meta = await sharp(gif, { animated: true }).metadata();
  assert.equal(meta.pages, 2);
  assert.deepEqual(meta.delay, [60, 80]);
  const raw = await sharp(gif, { animated: true }).ensureAlpha().raw().toBuffer();
  const pixel = (page: number, x: number, y: number) => {
    const start = page * width * height * 4 + (y * width + x) * 4;
    return [raw[start], raw[start + 1], raw[start + 2], raw[start + 3]];
  };
  assert.deepEqual(pixel(0, 0, 0), [0, 0, 0, 0]);
  assert.deepEqual(pixel(0, 8, 2), [240, 20, 20, 255]);
  assert.deepEqual(pixel(1, 8, 2), [240, 20, 20, 255]);
  assert.deepEqual(pixel(1, 8, 6), [20, 20, 220, 255]);
  assert.deepEqual(pixel(1, 0, 0), [0, 0, 0, 0]);
});
