import assert from "node:assert/strict";
import test from "node:test";
import { encodeApng } from "../utils/apng.js";
import { ditherCardFade, paintCardShine, paintCornerBurn, shinePrism } from "./card-animations.js";

function solid(width: number, height: number, color: [number, number, number, number]): Buffer {
  const buf = Buffer.alloc(width * height * 4);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = color[0];
    buf[i + 1] = color[1];
    buf[i + 2] = color[2];
    buf[i + 3] = color[3];
  }
  return buf;
}

function maxRed(buf: Buffer, width: number, x0: number, y0: number, x1: number, y1: number): number {
  let max = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      max = Math.max(max, buf[(y * width + x) * 4] ?? 0);
    }
  }
  return max;
}

test("apng frames loop as an animated png", () => {
  const frame = (red: number) => {
    const buf = Buffer.alloc(4 * 4 * 4);
    for (let i = 0; i < buf.length; i += 4) {
      buf[i] = red;
      buf[i + 3] = 255;
    }
    return buf;
  };
  const apng = encodeApng([frame(10), frame(200)], 4, 4, [40, 80]);
  const marker = apng.indexOf("acTL");
  assert.ok(marker > 0);
  assert.equal(apng.readUInt32BE(marker + 4), 2);
  assert.equal(apng.readUInt32BE(marker + 8), 0);
});

test("the shine crosses from the top-left toward the bottom-right", () => {
  const width = 48;
  const height = 72;
  const base = solid(width, height, [30, 30, 30, 255]);
  const early = paintCardShine(base, width, height, 0.18);
  const late = paintCardShine(base, width, height, 0.72);
  const earlyCorner = maxRed(early, width, 0, 0, 10, 10);
  const earlyFar = maxRed(early, width, 36, 58, 47, 71);
  const lateCorner = maxRed(late, width, 0, 0, 10, 10);
  const lateFar = maxRed(late, width, 36, 58, 47, 71);
  assert.ok(earlyCorner > 30);
  assert.equal(earlyFar, 30);
  assert.equal(lateCorner, 30);
  assert.ok(lateFar > 30);
});

function clearCount(buf: Buffer, width: number, x0: number, y0: number, x1: number, y1: number): number {
  let count = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if ((buf[(y * width + x) * 4 + 3] ?? 0) === 0) count++;
    }
  }
  return count;
}

test("the burn starts in the top-left and finishes in the bottom-right", () => {
  const width = 48;
  const height = 72;
  const base = solid(width, height, [40, 50, 70, 255]);
  const early = paintCornerBurn(base, width, height, 0.2);
  const late = paintCornerBurn(base, width, height, 0.92);
  assert.ok(clearCount(early, width, 0, 0, 8, 8) > clearCount(early, width, 36, 60, 47, 71));
  assert.ok(clearCount(late, width, 36, 60, 47, 71) > 20);
});

test("the burn fades back as grain, with pixels either clear or solid", () => {
  const width = 32;
  const height = 32;
  const base = solid(width, height, [40, 50, 70, 255]);
  const faded = ditherCardFade(base, width, height, 0.45);
  let clear = 0;
  let solidPixels = 0;
  let partial = 0;
  for (let i = 3; i < faded.length; i += 4) {
    const alpha = faded[i] ?? 0;
    if (alpha === 0) clear++;
    else if (alpha === 255) solidPixels++;
    else partial++;
  }
  assert.equal(partial, 0);
  assert.ok(clear > 200);
  assert.ok(solidPixels > 200);
});

test("the fringe is prismatic and clear pixels stay clear", () => {
  const leading = shinePrism(0);
  const trailing = shinePrism(0.99);
  assert.ok(leading[0] > leading[2]);
  assert.ok(trailing[2] > trailing[0]);

  const width = 8;
  const height = 8;
  const base = solid(width, height, [30, 30, 30, 0]);
  base[3] = 0;
  const shone = paintCardShine(base, width, height, 0.2);
  assert.equal(shone[0], 30);
  assert.equal(shone[3], 0);
});
