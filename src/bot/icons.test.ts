import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { renderIconPng } from "./icon-sync.js";
import { icon, iconSpec, installIcons } from "../utils/icons.js";

test("icons fall back to unicode until discord ids are installed", () => {
  installIcons([]);
  assert.equal(icon("chevron-left"), "◀️");
  assert.equal(icon("star"), "★");
  assert.equal(icon("square"), "◾");
  installIcons([{ key: "check", id: "123456789012345678", name: "ak_check" }]);
  assert.equal(icon("check"), "<:ak_check:123456789012345678>");
  installIcons([{ key: "bar-start-1", id: "123456789012345678", name: "ak_bar_start_1" }]);
  assert.equal(icon("bar-start-1"), "<:ak_bar_start_1:123456789012345678>");
  installIcons([]);
  assert.equal(icon("check"), "✅");
});

test("lucide icons rasterize to a small png", async () => {
  const png = await renderIconPng(iconSpec("chevron-left"));
  assert.equal(png.subarray(0, 4).toString("hex"), "89504e47");
  assert.ok(png.length < 256 * 1024);
  const star = await renderIconPng(iconSpec("star"));
  const slot = await renderIconPng(iconSpec("slot-1"));
  const bar = await renderIconPng(iconSpec("bar-mid-full"));
  const end = await renderIconPng(iconSpec("bar-end-32"));
  assert.equal(star.subarray(0, 4).toString("hex"), "89504e47");
  assert.equal(slot.subarray(0, 4).toString("hex"), "89504e47");
  assert.equal(bar.subarray(0, 4).toString("hex"), "89504e47");
  assert.equal(end.subarray(0, 4).toString("hex"), "89504e47");
});

test("a 1px sliver stays inside the rounded track", async () => {
  const png = await renderIconPng(iconSpec("bar-start-1"));
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number) => {
    const i = (y * info.width + x) * info.channels;
    return { r: data[i] ?? 0, g: data[i + 1] ?? 0, b: data[i + 2] ?? 0, a: data[i + 3] ?? 0 };
  };
  assert.equal(at(0, 16).a, 0);
  const nose = at(1, 33);
  assert.ok(nose.a > 200);
  assert.ok(nose.r > 100);
});
