import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  combinedLines,
  effectHome,
  EMPTY_PRESTIGE,
  dropWeight,
  extendExpiry,
  includeInDrop,
  MILESTONES,
  mintSentence,
  missedMidnight,
  pickServerBuffs,
  poolChoices,
  poolTier,
  prestigeKinds,
  resolveEffects,
  rollDropArts,
  SHOP_ITEMS,
  type ActiveEffects,
} from "./buffs.js";

const base = (patch: Partial<ActiveEffects> = {}): ActiveEffects => ({
  shop: [],
  server: [],
  seriesId: null,
  prestige: { ...EMPTY_PRESTIGE },
  ...patch,
});

describe("server pool tiers", () => {
  it("keeps a pot under 500", () => {
    assert.equal(poolTier(499), 0);
    assert.deepEqual(poolChoices(0), []);
  });

  it("always grants grab cooldown at tier 1", () => {
    assert.equal(poolTier(500), 1);
    assert.deepEqual(pickServerBuffs(1, () => 0.99), ["grab_cooldown"]);
  });

  it("picks two different lower buffs at tier 4", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const picked = pickServerBuffs(4, () => (i % 7) / 7);
      assert.equal(picked.length, 2);
      assert.equal(new Set(picked).size, 2);
      for (const kind of picked) seen.add(kind);
    }
    assert.ok(seen.size >= 2);
  });
});

describe("cooldown floors and mint copy", () => {
  it("stops drop and grab at the stated floors", () => {
    const both = resolveEffects(
      base({ shop: ["drop_cooldown", "grab_cooldown"], server: ["drop_cooldown", "grab_cooldown"] }),
    );
    assert.equal(both.dropCooldownMs, 5 * 60 * 1000);
    assert.equal(both.grabCooldownMs, 75 * 1000);
    assert.equal(
      combinedLines(base({ shop: ["grab_cooldown"] })).join(" "),
      "Reduces your grab cooldown to 2 minutes 30 seconds.",
    );
    assert.equal(
      combinedLines(base({ shop: ["drop_cooldown"], server: ["drop_cooldown"] })).join(" "),
      "Reduces your drop cooldown to 5 minutes.",
    );
  });

  it("says 1 in 100, 1 in 51, and 1 in 34", () => {
    assert.equal(mintSentence(1, 0), "Mints appear 1 in 100 cards.");
    assert.equal(mintSentence(2, 1), "Mints appear 1 in 51 cards.");
    assert.equal(mintSentence(3, 2), "Mints appear 1 in 34 cards.");
  });
});

describe("shop duration and card count", () => {
  it("extends a buff that is still running", () => {
    const now = new Date("2026-10-15T12:00:00.000Z");
    const current = new Date("2026-10-15T18:00:00.000Z");
    const next = extendExpiry(current, now, 24 * 60 * 60 * 1000);
    assert.equal(next.toISOString(), "2026-10-16T18:00:00.000Z");
  });

  it("keeps the series that was paid for after the shop rotates", () => {
    const locked = resolveEffects(base({ shop: ["featured_series"], seriesId: "bought" }));
    assert.equal(locked.seriesId, "bought");
    assert.equal(locked.featuredSeriesChance, 0.9);
    assert.equal(resolveEffects(base()).featuredSeriesChance, 0);
    assert.match(combinedLines(base({ shop: ["featured_series"], seriesId: "bought" })).join(" "), /90% chance/);
  });

  it("puts nine in ten cards in a featured drop inside the series", () => {
    const effects = {
      ...resolveEffects(base({ shop: ["featured_series"], seriesId: "show" })),
    };
    const pool = [
      { id: "show-lead", rarity: "Common", seriesId: "show", role: "MAIN" },
      { id: "show-alt", rarity: "Common", seriesId: "show", role: "SUPPORTING" },
      { id: "other-lead", rarity: "Common", seriesId: "other", role: "MAIN" },
      { id: "other-alt", rarity: "Common", seriesId: "other", role: "SUPPORTING" },
    ];
    // The first roll of each card picks the series: under 0.9 hits, over it misses.
    const hit = rollDropArts(pool, () => 0.5, 200, effects);
    assert.equal(hit.filter((card) => card.seriesId === "show").length, 200);
    const miss = rollDropArts(pool, () => 0.95, 200, effects);
    assert.equal(miss.some((card) => card.seriesId === "show"), false);
    let seed = 7;
    const rng = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const sample = rollDropArts(pool, rng, 2000, effects);
    const inside = sample.filter((card) => card.seriesId === "show").length / sample.length;
    // 90% from the featured roll, plus the plain pool's own share of the series.
    assert.ok(inside > 0.9 && inside < 0.97, `expected about 90% plus the plain share, got ${inside}`);
    const plain = rollDropArts(pool, rng, 400, { ...effects, seriesId: null, featuredSeriesChance: 0 });
    assert.ok(plain.filter((card) => card.seriesId === "show").length < 400);
  });

  it("still stays inside MAIN characters for a featured quality-over-quantity drop", () => {
    const effects = {
      ...resolveEffects(base({ shop: ["featured_series", "quality_over_quantity"], seriesId: "show" })),
    };
    const pool = [
      { id: "show-lead", rarity: "Common", seriesId: "show", role: "MAIN" },
      { id: "show-alt", rarity: "Common", seriesId: "show", role: "SUPPORTING" },
      { id: "other-lead", rarity: "Common", seriesId: "other", role: "MAIN" },
    ];
    const cards = rollDropArts(pool, () => 0.5, 5, effects);
    assert.equal(cards.length, 5);
    assert.equal(cards.filter((card) => card.id === "show-lead").length, 5);
  });

  it("drops only MAIN characters while quality over quantity is on", () => {
    assert.equal(includeInDrop("MAIN", true), true);
    assert.equal(includeInDrop("SUPPORTING", true), false);
    assert.equal(includeInDrop(null, true), false);
    assert.equal(includeInDrop("SUPPORTING", false), true);
    const effects = resolveEffects(
      base({ shop: ["quality_over_quantity", "featured_series"], seriesId: "show" }),
    );
    assert.equal(effects.cardCount, 1);
    assert.equal(effects.mainMultiplier, 1);
    const featured = dropWeight({
      variantId: "hero-base",
      rarity: "Common",
      seriesId: "show",
      role: "MAIN",
      effects,
    });
    const other = dropWeight({
      variantId: "lead-base",
      rarity: "Common",
      seriesId: "other",
      role: "MAIN",
      effects,
    });
    assert.equal(featured, other);
    assert.match(
      combinedLines(base({ shop: ["quality_over_quantity"] })).join(" "),
      /only MAIN characters can appear/,
    );
  });

  it("never makes five cards, and one card wins over four", () => {
    const four = resolveEffects(base({ shop: ["four_cards"], server: ["four_cards"] }));
    assert.equal(four.cardCount, 4);
    const one = resolveEffects(
      base({ shop: ["four_cards", "quality_over_quantity"], server: ["four_cards"] }),
    );
    assert.equal(one.cardCount, 1);
  });
});

describe("milestones and prestige", () => {
  it("doubles the cost each step", () => {
    assert.equal(MILESTONES[0]?.cost, 250);
    for (let i = 1; i < MILESTONES.length; i++) {
      assert.equal(MILESTONES[i]!.cost, MILESTONES[i - 1]!.cost * 2);
      assert.ok(MILESTONES[i]!.payout < MILESTONES[i]!.cost);
    }
  });

  it("grants nothing at 5 and every percent at 10", () => {
    assert.deepEqual(prestigeKinds(5), []);
    assert.deepEqual(prestigeKinds(10), ["burn", "grab", "drop", "mint", "main"]);
  });

  it("makes a second tier-10 prestige 2 percent on each", () => {
    const twice = resolveEffects(
      base({ prestige: { burn: 2, grab: 2, drop: 2, mint: 2, main: 2 } }),
    );
    assert.equal(twice.burnMultiplier, 1.02);
    assert.equal(twice.grabCooldownMs, Math.round(5 * 60 * 1000 * 0.98));
    assert.equal(twice.dropCooldownMs, Math.round(20 * 60 * 1000 * 0.98));
    assert.equal(twice.legendaryWeight, 1.02);
    assert.equal(twice.mainMultiplier, 1.02);
    assert.match(combinedLines(base({ prestige: { ...EMPTY_PRESTIGE, burn: 2 } })).join(" "), /Burns pay 2% more/);
    assert.equal(
      mintSentence(1.02, 0),
      "Mints appear a little more often than 1 in 100 cards.",
    );
  });
});

describe("effect home", () => {
  it("keeps a shop-only explanation with the shop", () => {
    assert.equal(effectHome({ shop: 1, server: false, prestige: 0 }), "shop");
    assert.equal(effectHome({ shop: 0, server: true, prestige: 0 }), "server");
    assert.equal(effectHome({ shop: 1, server: true, prestige: 0 }), "together");
    assert.equal(effectHome({ shop: 0, server: false, prestige: 1 }), null);
    assert.equal(effectHome({ shop: 0, server: false, prestige: 0 }), null);
  });
});

describe("shop catalog", () => {
  it("lists the seven personal buffs in page order", () => {
    assert.deepEqual(
      SHOP_ITEMS.map((item) => item.id),
      [
        "drop_cooldown",
        "grab_cooldown",
        "burn_value",
        "four_cards",
        "shiny_luck",
        "featured_series",
        "quality_over_quantity",
      ],
    );
  });
});

describe("midnight", () => {
  it("notices a roll that was missed after midnight", () => {
    const now = new Date("2026-10-15T01:00:00.000Z");
    assert.equal(missedMidnight(new Date("2026-10-14T00:05:00.000Z"), now), true);
    assert.equal(missedMidnight(new Date("2026-10-15T00:05:00.000Z"), now), false);
  });
});
