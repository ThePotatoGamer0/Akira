import assert from "node:assert/strict";
import test from "node:test";
import { progressBar } from "../utils/progress-bar.js";

test("an empty bar is the dark track and a full bar is the light fill", () => {
  assert.equal(progressBar(0, 4), "▱▱▱▱");
  assert.equal(progressBar(1, 4), "▰▰▰▰");
  assert.equal(progressBar(-2, 4), "▱▱▱▱");
  assert.equal(progressBar(3, 4), "▰▰▰▰");
});

test("a partial bar ends in a rounded cap between the fill and the track", () => {
  const bar = progressBar(0.5, 8);
  assert.equal(bar.startsWith("▰"), true);
  assert.equal(bar.endsWith("▱"), true);
  assert.equal(bar.includes("▰"), true);
  assert.equal(bar.includes("▱"), true);
  assert.equal(bar.length, 8);
});

