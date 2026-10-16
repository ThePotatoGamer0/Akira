import assert from "node:assert/strict";
import test from "node:test";
import { easterEgg, easterEggFromMessage } from "./easter-eggs.js";

const prefixes = ["a", "k!", "k"];

test("easter eggs reply only to the bare command", () => {
  assert.equal(easterEgg("boop", ""), "boop denied.");
  assert.equal(easterEgg("BOOP", ""), "boop denied.");
  assert.equal(easterEgg("boop", "please"), null);
  assert.equal(easterEgg("drop", ""), null);
});

test("a leading a or k is the prefix, not part of the egg", () => {
  assert.equal(easterEggFromMessage("kys", prefixes), "why would you say that.");
  assert.equal(easterEggFromMessage("k!ys", prefixes), "why would you say that.");
  assert.equal(easterEggFromMessage("ass", prefixes), "you meant that.");
  assert.equal(easterEggFromMessage("acdc", prefixes), "acdc is a band.");
  assert.equal(easterEggFromMessage("aboop", prefixes), "boop denied.");
  assert.equal(easterEggFromMessage("kys please", prefixes), null);
  assert.equal(easterEggFromMessage("adrop", prefixes), null);
  assert.equal(easterEggFromMessage("hello", prefixes), null);
});
