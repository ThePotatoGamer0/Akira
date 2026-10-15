import assert from "node:assert/strict";
import test from "node:test";
import { editionNumber } from "./editions.js";
import { applyCardFilters, filtersAreInvocable, parseCardFilters, type FilterCard } from "./filters.js";

function card(partial: Partial<FilterCard> & Pick<FilterCard, "characterName" | "seriesName">): FilterCard {
  return {
    printNumber: 1,
    quality: "COMMON",
    tag: null,
    obtainedAt: new Date("2026-01-01T00:00:00Z"),
    wishlistCount: 0,
    edition: 1,
    ...partial,
  };
}

test("filters accept a colon or the word is, and ignore ordinary text", () => {
  const series = parseCardFilters("s:Death Note");
  assert.equal(series.ok && series.filter.series, "Death Note");
  const spaced = parseCardFilters("s is My Hero Academia q is epic");
  assert.equal(spaced.ok && spaced.filter.series, "My Hero Academia");
  assert.equal(spaced.ok && spaced.filter.quality, "EPIC");
  assert.equal(spaced.ok && spaced.text, "s:My Hero Academia q:4");
  const mixed = parseCardFilters("c is Izuku Midoriya t:Fav o:#");
  assert.equal(mixed.ok && mixed.filter.character, "Izuku Midoriya");
  assert.equal(mixed.ok && mixed.filter.tag, "fav");
  assert.equal(mixed.ok && mixed.filter.order, "print");
  assert.equal(parseCardFilters("").ok, true);
  assert.equal(parseCardFilters("hello").ok, false);
  assert.equal(filtersAreInvocable("hello"), false);
  assert.equal(filtersAreInvocable("o:i"), true);
  assert.equal(parseCardFilters("o:i").ok, false);
  assert.equal(parseCardFilters("q:9").ok, false);
  assert.equal(parseCardFilters("e:0").ok, false);
  assert.equal(parseCardFilters("s is").ok, false);
});

test("filters narrow cards and can sort by print or wishlists", () => {
  const cards = [
    card({ characterName: "Izuku Midoriya", seriesName: "My Hero Academia", quality: "EPIC", printNumber: 8, tag: "fav", edition: 1, wishlistCount: 1, obtainedAt: new Date("2026-01-03") }),
    card({ characterName: "Ochaco Uraraka", seriesName: "My Hero Academia", quality: "COMMON", printNumber: 1, tag: null, edition: 2, wishlistCount: 4, obtainedAt: new Date("2026-01-02") }),
    card({ characterName: "Halle Bullook", seriesName: "Death Note", quality: "EPIC", printNumber: 2, tag: "fav", edition: 1, wishlistCount: 0, obtainedAt: new Date("2026-01-04") }),
  ];
  const hero = applyCardFilters(cards, { series: "hero" });
  assert.deepEqual(hero.map((item) => item.characterName), ["Izuku Midoriya", "Ochaco Uraraka"]);
  const tagged = applyCardFilters(cards, { tag: "fav", quality: "EPIC" });
  assert.deepEqual(tagged.map((item) => item.characterName), ["Halle Bullook", "Izuku Midoriya"]);
  const prints = applyCardFilters(cards, { order: "print" });
  assert.deepEqual(prints.map((item) => item.printNumber), [1, 2, 8]);
  const wishes = applyCardFilters(cards, { order: "wishlist" });
  assert.equal(wishes[0]?.characterName, "Ochaco Uraraka");
  const edition = applyCardFilters(cards, { edition: 2 });
  assert.deepEqual(edition.map((item) => item.characterName), ["Ochaco Uraraka"]);
});

test("edition numbers follow the lookup order", () => {
  const variants = [
    { id: "denji-transformed", name: "Transformed" },
    { id: "denji-base", name: "Denji" },
  ];
  assert.equal(editionNumber(variants, "denji-base"), 1);
  assert.equal(editionNumber(variants, "denji-transformed"), 2);
  assert.equal(editionNumber(variants, "missing"), 0);
});
