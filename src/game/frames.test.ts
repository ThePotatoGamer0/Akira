import assert from "node:assert/strict";
import test from "node:test";
import { frameName, parseFrameToken } from "./frames.js";

test("named frames cover the color set", () => {
  assert.equal(frameName(0), "dark");
  assert.equal(frameName(1), "yellow");
  assert.equal(frameName(4), "blue");
  assert.equal(frameName(6), "pink");
  assert.equal(frameName(99), "99");
  assert.equal(parseFrameToken("Dark"), 0);
  assert.equal(parseFrameToken("yellow"), 1);
  assert.equal(parseFrameToken("Pink"), 6);
  assert.equal(parseFrameToken("1"), 1);
  assert.equal(parseFrameToken("gold"), null);
});
