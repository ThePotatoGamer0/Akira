import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { encodeClearedGif } from "./gif-fast.js";

const WIDTH = 306;
const HEIGHT = 516;

/**
 * The current burn writer quantizes the first frame and writes every later one as
 * a full card. Comparing one frame lets a test treat a page on its own, since the
 * decoder reads the animation faithfully and the page sizes differ.
 */
function card(): Buffer {
  const out = Buffer.alloc(WIDTH * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const offset = (y * WIDTH + x) * 4;
      out[offset] = 40 + ((x * 7) % 80);
      out[offset + 1] = 90 + ((y * 5) % 60);
      out[offset + 2] = 160;
      out[offset + 3] = 255;
    }
  }
  return out;
}

function rowsCleared(base: Buffer, rows: number): Buffer {
  const out = Buffer.from(base);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < WIDTH; x++) out[(y * WIDTH + x) * 4 + 3] = 0;
  }
  return out;
}

function alphaAt(data: Buffer, x: number, y: number): number {
  return data[(y * WIDTH + x) * 4 + 3] ?? 0;
}

async function pageOf(gif: Buffer, index: number): Promise<Buffer> {
  return sharp(gif, { animated: true, page: index }).ensureAlpha().raw().toBuffer();
}

test("the first frame of a burn is the card with the flame's start cleared", async () => {
  const base = card();
  const picture = rowsCleared(base, 60);
  const gif = await encodeClearedGif(base, WIDTH, HEIGHT, picture, 1, [110]);
  const page = await pageOf(gif, 0);
  assert.equal(alphaAt(page, 100, 0), 0);
  assert.equal(alphaAt(page, 100, 100), 255);
});

test("a burn that fades back ends on the whole card", async () => {
  const base = card();
  const frames = Buffer.concat([rowsCleared(base, 100), rowsCleared(base, 400), Buffer.from(base)]);
  const gif = await encodeClearedGif(base, WIDTH, HEIGHT, frames, 3, [110, 110, 110]);
  assert.equal((await sharp(gif, { animated: true }).metadata()).pages, 3);
  const last = await pageOf(gif, 2);
  assert.equal(alphaAt(last, 100, 0), 255);
});
