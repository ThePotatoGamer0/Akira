import assert from "node:assert/strict";
import test from "node:test";
import { frameName, parseFrameToken } from "./frames.js";

test("named frames are dark and yellow", () => {
  assert.equal(frameName(0), "dark");
  assert.equal(frameName(1), "yellow");
  assert.equal(frameName(4), "4");
  assert.equal(parseFrameToken("Dark"), 0);
  assert.equal(parseFrameToken("yellow"), 1);
  assert.equal(parseFrameToken("1"), 1);
  assert.equal(parseFrameToken("gold"), null);
});
