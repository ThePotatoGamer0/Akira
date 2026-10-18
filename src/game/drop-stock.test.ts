import assert from "node:assert/strict";
import test from "node:test";
import type { ResolvedEffects } from "./buffs.js";
import { DROP_SHAPES, dropShape, dropShapeKey, pityKeepsQualities, shelfDepth } from "./drop-stock.js";

function effects(partial: Partial<ResolvedEffects> = {}): ResolvedEffects {
  return {
    dropCooldownMs: 1,
    grabCooldownMs: 1,
    burnMultiplier: 1,
    cardCount: 3,
    legendaryWeight: 1,
    seriesId: null,
    qualityOverQuantity: false,
    mainMultiplier: 1,
    ...partial,
  };
}

test("the shared shelves are the nine buff states", () => {
  assert.equal(DROP_SHAPES.length, 9);
  const keys = DROP_SHAPES.map((shape) => dropShapeKey({ ...shape, frameId: 0, seriesId: null }));
  assert.equal(new Set(keys).size, 9);
});

test("prestige stays off the shared shelves", () => {
  assert.equal(dropShape(effects({ mainMultiplier: 1.01 }), 0), null);
  assert.equal(dropShape(effects({ legendaryWeight: 1.02 }), 0), null);
  assert.equal(dropShape(effects({ seriesId: "chainsaw-man", legendaryWeight: 2.02 }), 0), null);
});

test("a bought series gets its own shelf, and only one picture", () => {
  const shape = dropShape(effects({ seriesId: "chainsaw-man", cardCount: 4, legendaryWeight: 2 }), 0);
  assert.ok(shape);
  assert.equal(dropShapeKey(shape), "0:n:4:2:chainsaw-man");
  assert.equal(shelfDepth(shape), 1);
  const plain = dropShape(effects(), 0);
  assert.ok(plain);
  assert.equal(shelfDepth(plain), 2);
});

test("a plain drop matches the shelf for its card count and shiny luck", () => {
  const shape = dropShape(effects({ cardCount: 4, legendaryWeight: 3 }), 2);
  assert.deepEqual(shape, {
    frameId: 2,
    cardCount: 4,
    qualityOverQuantity: false,
    legendaryWeight: 3,
    seriesId: null,
  });
  const single = dropShape(effects({ cardCount: 1, qualityOverQuantity: true, legendaryWeight: 2 }), 0);
  assert.equal(single && dropShapeKey(single), "0:q:1:2:");
});

test("pity can use a shelved drop until the forced mint", () => {
  assert.equal(pityKeepsQualities(0, ["COMMON", "RARE", "EPIC"]), true);
  assert.equal(pityKeepsQualities(198, ["COMMON"]), true);
  assert.equal(pityKeepsQualities(199, ["COMMON", "RARE"]), false);
  assert.equal(pityKeepsQualities(199, ["COMMON", "LEGENDARY"]), true);
});
