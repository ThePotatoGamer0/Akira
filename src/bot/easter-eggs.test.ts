import assert from "node:assert/strict";
import test from "node:test";
import { easterEgg } from "./easter-eggs.js";

test("easter eggs reply only to the bare command", () => {
  assert.equal(easterEgg("boop", ""), "Akira blinks. Boop received.");
  assert.equal(easterEgg("BOOP", ""), "Akira blinks. Boop received.");
  assert.equal(easterEgg("boop", "please"), null);
  assert.equal(easterEgg("drop", ""), null);
});
