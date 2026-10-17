import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import sharp from "sharp";
import { renderCardImage } from "./composite-static.js";
import { loadFrame } from "../utils/frames.js";
import { variantArtPath } from "../utils/paths.js";

test("composites character art, the frame, and a print number", async (t) => {
  const frame = loadFrame(0);
  const art = variantArtPath("chainsaw-man", "denji", "base.png");
  if (!frame || !fs.existsSync(art)) {
    t.skip("sample frame or Denji art is not in this checkout");
    return;
  }
  assert.equal(frame.characterName?.horizontalAnchor, "center");
  assert.equal(frame.printNumber?.horizontalAnchor, "right");
  assert.ok(frame.seriesName);
  assert.ok((frame.printNumber?.y ?? 600) < 585);
  const name = frame.characterName;
  const print = frame.printNumber;
  const texts = [];
  if (name) texts.push({ ...name, text: "Denji" });
  if (print) texts.push({ ...print, text: "#1" });
  const buf = await renderCardImage(art, frame.imagePath, texts);
  assert.equal(buf[0], 0x89);
  assert.equal(buf[1], 0x50);
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const corner = data[3];
  const windowIndex = (300 * info.width + 200) * 4;
  assert.equal(corner, 0);
  assert.notEqual(data[windowIndex + 3], 0);
});

test("a wide portrait keeps the character and fills the empty strip", async (t) => {
  const frame = loadFrame(0);
  const art = variantArtPath("death-note", "kiichiro-osoreda", "base.png");
  if (!frame || !fs.existsSync(art)) {
    t.skip("sample frame or wide portrait is not in this checkout");
    return;
  }
  const buf = await renderCardImage(art, frame.imagePath, []);
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const top = (40 * info.width + 200) * 4;
  const picture = (220 * info.width + 200) * 4;
  assert.ok((data[top + 3] ?? 0) > 200);
  assert.ok((data[picture + 3] ?? 0) > 200);
});

test("ambient frame fills the polaroid from the card art", async (t) => {
  const frame = loadFrame(10);
  const art = variantArtPath("chainsaw-man", "denji", "base.png");
  if (!frame?.ambient || !fs.existsSync(art)) {
    t.skip("ambient frame or Denji art is not in this checkout");
    return;
  }
  const plain = loadFrame(0);
  assert.ok(plain);
  const name = frame.characterName;
  const print = frame.printNumber;
  const texts = [];
  if (name) texts.push({ ...name, text: "Denji" });
  if (print) texts.push({ ...print, text: "#1" });
  const ambient = await renderCardImage(art, frame.imagePath, texts, { ambient: true });
  const dark = await renderCardImage(art, plain.imagePath, texts);
  const painted = await sharp(ambient).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const original = await sharp(dark).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const chin = (520 * painted.info.width + 200) * 4;
  const windowIndex = (200 * painted.info.width + 200) * 4;
  assert.equal(painted.data[3], 0);
  assert.notEqual(painted.data[windowIndex + 3], 0);
  const changed =
    painted.data[chin] !== original.data[chin] ||
    painted.data[chin + 1] !== original.data[chin + 1] ||
    painted.data[chin + 2] !== original.data[chin + 2];
  assert.equal(changed, true);
});
