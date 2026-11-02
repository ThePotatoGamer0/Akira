import assert from "node:assert/strict";
import test from "node:test";
import { poolOutlook } from "./pool.js";

const FOUR = ["Grab cooldown", "Drop cooldown", "Shiny luck", "Four cards"];
const ALL = [...FOUR, "Tracked pull"];

test("below the first goal nothing is promised", () => {
  assert.deepEqual(poolOutlook(0, []), ["Tonight: nothing is chosen until the pot reaches 10,000 bits."]);
});

test("at 10k the tracked pull is called out as always on", () => {
  const lines = poolOutlook(12_000, ALL);
  assert.equal(lines[0], "Tonight: always Tracked pull, plus 2 of Grab cooldown, Drop cooldown, Shiny luck, Four cards.");
  assert.equal(lines.length, 1);
});

test("the tracked pull is never listed among the buffs that roll", () => {
  for (const bits of [10_000, 30_000, 60_000]) {
    const [first] = poolOutlook(bits, ALL);
    assert.ok(first && !first.includes("plus 3 of"), first);
    assert.ok(first?.includes("2 of Grab cooldown"), first);
  }
});

test("25k says the poll leaves one slot to roll", () => {
  const lines = poolOutlook(30_000, ALL);
  assert.equal(lines[1], "Choose at random: the slot the poll does not pick.");
});

test("50k says nothing is left to roll", () => {
  const lines = poolOutlook(70_000, ALL);
  assert.equal(lines[1], "Choose at random: none. The poll's top two are guaranteed.");
});
