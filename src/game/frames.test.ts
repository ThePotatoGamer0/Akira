import assert from "node:assert/strict";
import test from "node:test";
import { loadFrame } from "../utils/frames.js";
import { displayFrameId, frameLabel, frameName, parseFrameToken } from "./frames.js";

test("named frames cover the color set", () => {
  assert.equal(frameName(0), "dark");
  assert.equal(frameName(1), "yellow");
  assert.equal(frameName(4), "blue");
  assert.equal(frameName(6), "pink");
  assert.equal(frameName(10), "ambient");
  assert.equal(frameName(99), "99");
  assert.equal(parseFrameToken("Dark"), 0);
  assert.equal(parseFrameToken("yellow"), 1);
  assert.equal(parseFrameToken("Pink"), 6);
  assert.equal(parseFrameToken("ambient"), 10);
  assert.equal(parseFrameToken("Ambient"), 10);
  assert.equal(parseFrameToken("1"), 1);
  assert.equal(parseFrameToken("gold"), null);
  assert.equal(frameName(11), "11");
  assert.equal(parseFrameToken("plaque"), null);
  assert.equal(parseFrameToken("11"), null);
  assert.equal(loadFrame(11), null);
  assert.equal(frameName(12), "celestial");
  assert.equal(frameLabel(12), "Celestial");
  assert.equal(frameLabel(13), "Arcade Machine");
  assert.equal(frameLabel(32), "Yin and Yang");
  assert.equal(parseFrameToken("hacker"), 24);
  assert.equal(parseFrameToken("yinandyang"), 32);
});

test("arcade has no name plates, and celestial keeps both labels in their bars", () => {
  const arcade = loadFrame(13);
  assert.equal(arcade?.characterName, null);
  assert.equal(arcade?.seriesName, null);
  const celestial = loadFrame(12);
  assert.ok(celestial?.seriesName && celestial.characterName);
  assert.equal(celestial.seriesName.grow, false);
  assert.ok(celestial.seriesName.y < celestial.characterName.y);
});

test("a card frame wins, then a personal frame, then the server frame", () => {
  assert.equal(displayFrameId(6, 0, 1), 6);
  assert.equal(displayFrameId(null, 0, 1), 1);
  assert.equal(displayFrameId(null, 0, null), 0);
  assert.equal(displayFrameId(null, 0, 99), 0);
});
