import assert from "node:assert/strict";
import test from "node:test";
import { discordEmojiName, installIcons } from "../utils/icons.js";
import { progressBar, progressBarKeys } from "../utils/progress-bar.js";
import { BAR_CELL_PX, BAR_ICONS, BAR_OVERHANG_PX } from "../utils/seek-bar.js";

test("an empty bar is the dark track and a full bar is the light fill", () => {
  installIcons([]);
  assert.equal(progressBar(0, 4), "▱▱▱▱");
  assert.equal(progressBar(1, 4), "▰▰▰▰");
  assert.equal(progressBar(-2, 4), "▱▱▱▱");
  assert.equal(progressBar(3, 4), "▰▰▰▰");
  assert.deepEqual(progressBarKeys(0, 4), ["bar-start-0", "bar-mid-0", "bar-mid-0", "bar-end-0"]);
  assert.deepEqual(progressBarKeys(1, 4), ["bar-start-full", "bar-mid-full", "bar-mid-full", "bar-end-32"]);
});

test("a partial bar ends in a rounded cap between the fill and the track", () => {
  installIcons([]);
  const bar = progressBar(0.5, 8);
  assert.equal(bar.startsWith("▰"), true);
  assert.equal(bar.endsWith("▱"), true);
  assert.equal(bar.includes("▰"), true);
  assert.equal(bar.includes("▱"), true);
  assert.equal(bar.length, 8);
  assert.deepEqual(progressBarKeys(0.5, 8).slice(0, 5), [
    "bar-start-full",
    "bar-mid-full",
    "bar-mid-full",
    "bar-mid-32",
    "bar-mid-0",
  ]);
});

test("a sliver of progress is one pixel in the start cap", () => {
  installIcons([
    { key: "bar-start-1", id: "1", name: "ak_bar_start_1" },
    { key: "bar-start", id: "2", name: "ak_bar_start" },
    { key: "bar-head", id: "3", name: "ak_bar_head" },
    { key: "bar-mid-0", id: "4", name: "ak_bar_mid_0" },
    { key: "bar-end-0", id: "5", name: "ak_bar_end_0" },
    { key: "bar-solo-0", id: "6", name: "ak_bar_solo_0" },
    { key: "bar-solo-32", id: "7", name: "ak_bar_solo_32" },
  ]);
  const sliver = progressBar(0.001, 8);
  assert.equal(sliver.startsWith("<:ak_bar_start_1:1>"), true);
  assert.equal(sliver.includes("<:ak_bar_start:2>"), false);
  assert.equal(sliver.includes("<:ak_bar_head:3>"), false);
  assert.equal(progressBarKeys(0.001, 8)[0], "bar-start-1");
  assert.equal(progressBar(0, 1), "<:ak_bar_solo_0:6>");
  assert.equal(progressBar(1, 1), "<:ak_bar_solo_32:7>");
  installIcons([]);
});

test("a fill that ends on a seam uses the leftover cap on the next emoji", () => {
  const keys = progressBarKeys(33 / (8 * BAR_CELL_PX), 8);
  assert.equal(keys[0], "bar-start-33");
  assert.equal(keys[1], "bar-mid-1");
  assert.equal(keys[2], "bar-mid-0");
});

test("every 32px fill and cap-spill tile has a unique emoji", () => {
  const startMid = 2 * (BAR_CELL_PX + BAR_OVERHANG_PX + 1 + 1);
  const endSolo = 2 * (BAR_CELL_PX + 1);
  assert.equal(BAR_ICONS.length, startMid + endSolo);
  assert.equal(BAR_ICONS.length, 150);
  const names = new Set(BAR_ICONS.map((spec) => spec.key));
  assert.equal(names.size, BAR_ICONS.length);
  for (const spec of BAR_ICONS) {
    const name = discordEmojiName(spec.key);
    assert.ok(name.length >= 2 && name.length <= 32, name);
    assert.match(name, /^ak_[a-z0-9_]+$/);
  }
});
