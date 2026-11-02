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
  buffName,
  pickGoalBuffs,
  pickServerBuffs,
  POOL_GOALS,
  pollSlots,
  poolChoices,
  poolGoal,
  poolSpend,
  poolTier,
  prestigeKinds,
  resolveEffects,
  rollDropArts,
  shopItem,
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

  it("puts the goals at 10, 25 and 50 thousand", () => {
    assert.deepEqual(
      POOL_GOALS.map((row) => row.bits),
      [10_000, 25_000, 50_000],
    );
    assert.equal(poolGoal(9_999), 0);
    assert.equal(poolGoal(10_000), 10_000);
    assert.equal(poolGoal(24_999), 10_000);
    assert.equal(poolGoal(25_000), 25_000);
    assert.equal(poolGoal(50_000), 50_000);
    assert.equal(poolGoal(90_000), 50_000);
    assert.deepEqual([10_000, 25_000, 50_000].map(pollSlots), [0, 1, 2]);
  });

  it("spends only the goal reached and carries the rest", () => {
    assert.deepEqual(poolSpend(7_000), { goal: 0, spent: 0, carried: 7_000 });
    assert.deepEqual(poolSpend(10_400), { goal: 10_000, spent: 10_000, carried: 400 });
    assert.deepEqual(poolSpend(31_250), { goal: 25_000, spent: 25_000, carried: 6_250 });
    assert.deepEqual(poolSpend(72_000), { goal: 50_000, spent: 50_000, carried: 22_000 });
    // The carried part alone is still a tier 4 roll tomorrow.
    assert.equal(poolTier(poolSpend(31_250).carried), 4);
  });

  it("gives the 10k tracked pull, which is not sold in the shop", () => {
    assert.equal(buffName("tracked_pull"), "Tracked pull");
    assert.equal(shopItem("tracked_pull"), null);
    assert.equal(shopItem("four_cards")?.name, "Four cards");
  });

  it("guarantees the poll winner and rolls the second slot without repeating it", () => {
    for (let i = 0; i < 40; i++) {
      const rng = () => (i % 9) / 9;
      const one = pickGoalBuffs(25_000, 4, rng, ["four_cards"]);
      assert.equal(one.length, 2);
      assert.ok(one.includes("four_cards"), `random pick lost the vote: ${one.join(", ")}`);
      assert.equal(new Set(one).size, 2);
      const two = pickGoalBuffs(50_000, 4, rng, ["shiny_luck", "drop_cooldown"]);
      assert.deepEqual(two.sort(), ["drop_cooldown", "shiny_luck"]);
    }
  });

  it("never bumps a winner into a slot the tier does not have", () => {
    // Under 10,000 nobody voted.
    assert.deepEqual(pickGoalBuffs(0, 1, () => 0.99, ["four_cards"]), pickServerBuffs(1, () => 0.99));
    // A poll winner only fills a slot the tier would have rolled anyway. Tier 3 has one.
    const four = pickGoalBuffs(50_000, 3, () => 0.5, ["four_cards"]);
    assert.equal(four.length, 1);
    assert.ok(["four_cards", "drop_cooldown", "shiny_luck"].includes(four[0]!));
    // Everything the poll asks for lands once the tier has the slots.
    const both = pickGoalBuffs(50_000, 4, () => 0.5, ["grab_cooldown", "four_cards"]);
    assert.deepEqual(both.sort(), ["four_cards", "grab_cooldown"]);
  });
});

describe("tracked pull", () => {
  const pool = [
    ...Array.from({ length: 10 }, (_, index) => ({ id: `mine-${index}`, rarity: "Common", seriesId: "mine", role: "SUPPORTING" })),
    ...Array.from({ length: 50 }, (_, index) => ({ id: `other-${index}`, rarity: "Common", seriesId: "other", role: "SUPPORTING" })),
  ];
  const seeded = () => {
    let seed = 11;
    return () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
  };
  const share = (cards: { seriesId: string }[]) => cards.filter((card) => card.seriesId === "mine").length / cards.length;

  it("does nothing unless the server holds the buff", () => {
    const off = resolveEffects(base({ trackedSeriesIds: ["mine"] }));
    assert.deepEqual(off.trackedSeriesIds, []);
    const on = resolveEffects(base({ server: ["tracked_pull"], trackedSeriesIds: ["mine"] }));
    assert.deepEqual(on.trackedSeriesIds, ["mine"]);
    assert.match(combinedLines(base({ server: ["tracked_pull"] })).join(" "), /leans toward the series its player tracks/);
  });

  it("leans five times toward the dropper's own series", () => {
    const effects = resolveEffects(base({ server: ["tracked_pull"], trackedSeriesIds: ["mine"] }));
    assert.equal(
      dropWeight({ variantId: "mine-1", rarity: "Common", seriesId: "mine", role: null, effects }),
      5 * dropWeight({ variantId: "other-1", rarity: "Common", seriesId: "other", role: null, effects }),
    );
    const plain = rollDropArts(pool, seeded(), 4000, resolveEffects(base()));
    const leaned = rollDropArts(pool, seeded(), 4000, effects);
    // Chance alone is 10 of 60, about 17%. A 5x lean on those puts them near 45%.
    assert.ok(share(plain) > 0.13 && share(plain) < 0.2, `plain share was ${share(plain).toFixed(2)}`);
    assert.ok(share(leaned) > 0.4 && share(leaned) < 0.5, `leaned share was ${share(leaned).toFixed(2)}`);
  });

  it("follows the player dropping, not the server", () => {
    const mine = resolveEffects(base({ server: ["tracked_pull"], trackedSeriesIds: ["mine"] }));
    const theirs = resolveEffects(base({ server: ["tracked_pull"], trackedSeriesIds: ["other"] }));
    const mineShare = share(rollDropArts(pool, seeded(), 3000, mine));
    const theirsShare = share(rollDropArts(pool, seeded(), 3000, theirs));
    assert.ok(mineShare > theirsShare, `mine ${mineShare.toFixed(2)} vs theirs ${theirsShare.toFixed(2)}`);
    // "other" is the larger series, so leaning on it should push "mine" below plain chance.
    assert.ok(theirsShare < 0.2);
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
