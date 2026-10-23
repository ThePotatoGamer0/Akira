import assert from "node:assert/strict";
import test from "node:test";
import { renderIconPng } from "./icon-sync.js";
import { icon, iconSpec, installIcons } from "../utils/icons.js";

test("icons fall back to unicode until discord ids are installed", () => {
  installIcons([]);
  assert.equal(icon("chevron-left"), "◀️");
  assert.equal(icon("star"), "★");
  assert.equal(icon("square"), "◾");
  installIcons([{ key: "check", id: "123456789012345678", name: "ak_check" }]);
  assert.equal(icon("check"), "<:ak_check:123456789012345678>");
  installIcons([{ key: "bar-head", id: "123456789012345678", name: "ak_bar_head" }]);
  assert.equal(icon("bar-head"), "<:ak_bar_head:123456789012345678>");
  installIcons([]);
  assert.equal(icon("check"), "✅");
});

test("lucide icons rasterize to a small png", async () => {
  const png = await renderIconPng(iconSpec("chevron-left"));
  assert.equal(png.subarray(0, 4).toString("hex"), "89504e47");
  assert.ok(png.length < 256 * 1024);
  const star = await renderIconPng(iconSpec("star"));
  const slot = await renderIconPng(iconSpec("slot-1"));
  const bar = await renderIconPng(iconSpec("bar-fill"));
  assert.equal(star.subarray(0, 4).toString("hex"), "89504e47");
  assert.equal(slot.subarray(0, 4).toString("hex"), "89504e47");
  assert.equal(bar.subarray(0, 4).toString("hex"), "89504e47");
});
