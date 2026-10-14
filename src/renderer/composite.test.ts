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
