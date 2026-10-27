import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCatalogTrack as applyCatalogViewTrack,
  catalogCharacterNote,
  sortCatalogCharacters as sortCatalogViewCharacters,
  sortCatalogSeries as sortCatalogViewSeries,
} from "../../webui/client/src/lib/catalogView.ts";
import {
  applyCatalogTrack,
  pickCoverCharacter,
  seriesPosterUrl,
  sortCatalogSeries,
  sortSeriesByCompletion,
  sortSeriesCharacters,
  watchingAllMissing,
} from "./catalog.js";

test("series covers prefer a MAIN character, then the first name", () => {
  const supporting = { role: "SUPPORTING", name: "Aoi", slug: "aoi", variants: [{ id: "aoi-base", name: "Aoi", image: "base.png" }] };
  const main = { role: "MAIN", name: "Denji", slug: "denji", variants: [{ id: "denji-base", name: "Denji", image: "base.png" }] };
  const otherMain = { role: "MAIN", name: "Power", slug: "power", variants: [{ id: "power-base", name: "Power", image: "base.png" }] };
  assert.equal(pickCoverCharacter([supporting, otherMain, main])?.slug, "denji");
  assert.equal(pickCoverCharacter([supporting])?.slug, "aoi");
  assert.equal(pickCoverCharacter([]), undefined);
});

test("series list highest completion first, then name", () => {
  const rows = [
    { name: "Blue Lock", percent: 2 },
    { name: "Ace Attorney", percent: 0 },
    { name: "Chainsaw Man", percent: 4 },
    { name: "Berserk", percent: 0 },
  ];
  assert.deepEqual(
    sortSeriesByCompletion(rows).map((row) => row.name),
    ["Chainsaw Man", "Blue Lock", "Ace Attorney", "Berserk"],
  );
});

test("tracked series sit at the top in pin order", () => {
  const rows = [
    { id: "a", name: "Ace Attorney", percent: 80, tracked: false },
    { id: "c", name: "Chainsaw Man", percent: 10, tracked: true },
    { id: "b", name: "Blue Lock", percent: 50, tracked: true },
    { id: "d", name: "Demon Slayer", percent: 90, tracked: false },
  ];
  assert.deepEqual(
    sortCatalogSeries(rows, ["b", "c"]).map((row) => row.name),
    ["Blue Lock", "Chainsaw Man", "Demon Slayer", "Ace Attorney"],
  );
});

test("pinning appends a series to the tracked group, unpinning restores completion order", () => {
  const rows = [
    { id: "b", name: "Blue Lock", percent: 50, tracked: true },
    { id: "c", name: "Chainsaw Man", percent: 10, tracked: true },
    { id: "d", name: "Demon Slayer", percent: 90, tracked: false },
    { id: "a", name: "Ace Attorney", percent: 80, tracked: false },
  ];
  assert.deepEqual(
    applyCatalogTrack(rows, "a", true).map((row) => row.name),
    ["Blue Lock", "Chainsaw Man", "Ace Attorney", "Demon Slayer"],
  );
  assert.deepEqual(
    applyCatalogTrack(rows, "b", false).map((row) => row.name),
    ["Chainsaw Man", "Demon Slayer", "Ace Attorney", "Blue Lock"],
  );
});

test("series characters put owned ones last, names A to Z in each group", () => {
  const characters = [
    { name: "Power", owned: true },
    { name: "Aki", owned: false },
    { name: "Denji", owned: true },
    { name: "Kobeni", owned: false },
  ];
  assert.deepEqual(
    sortSeriesCharacters(characters).map((character) => character.name),
    ["Aki", "Kobeni", "Denji", "Power"],
  );
});

test("series posters fall back to a MAIN portrait when no AniList cover is on disk", () => {
  const main = { role: "MAIN", name: "Denji", slug: "denji", variants: [{ id: "denji-base", name: "Denji", image: "base.png" }] };
  assert.equal(
    seriesPosterUrl("no-such-series-zzzz", [main]),
    "/api/static/portraits/no-such-series-zzzz/denji/base.png",
  );
});

test("catalog view order keeps pins first, then completion, alpha, or recency", () => {
  const rows = [
    { id: "a", name: "Ace Attorney", percent: 80, tracked: false, lastGot: 10 },
    { id: "c", name: "Chainsaw Man", percent: 10, tracked: true, lastGot: 30 },
    { id: "b", name: "Blue Lock", percent: 50, tracked: true, lastGot: 20 },
    { id: "d", name: "Demon Slayer", percent: 90, tracked: false, lastGot: null },
  ];
  assert.deepEqual(
    sortCatalogViewSeries(rows, "completion").map((row) => row.name),
    ["Chainsaw Man", "Blue Lock", "Demon Slayer", "Ace Attorney"],
  );
  assert.deepEqual(
    sortCatalogViewSeries(rows, "alpha").map((row) => row.name),
    ["Chainsaw Man", "Blue Lock", "Ace Attorney", "Demon Slayer"],
  );
  assert.deepEqual(
    sortCatalogViewSeries(rows, "recent").map((row) => row.name),
    ["Chainsaw Man", "Blue Lock", "Ace Attorney", "Demon Slayer"],
  );
  assert.deepEqual(
    applyCatalogViewTrack(rows, "d", true, "alpha").map((row) => row.name),
    ["Chainsaw Man", "Blue Lock", "Demon Slayer", "Ace Attorney"],
  );
});

test("missing character posters stay Missing, Watching, or in collection", () => {
  assert.equal(catalogCharacterNote({ owned: false, wishlisted: false }), "Missing");
  assert.equal(catalogCharacterNote({ owned: false, wishlisted: true }), "Watching");
  assert.equal(catalogCharacterNote({ owned: true, wishlisted: false }), "In your collection");
});

test("a series star fills when every missing character is watched", () => {
  assert.equal(
    watchingAllMissing([
      { owned: true, wishlisted: false },
      { owned: false, wishlisted: true },
      { owned: false, wishlisted: true },
    ]),
    true,
  );
  assert.equal(
    watchingAllMissing([
      { owned: false, wishlisted: true },
      { owned: false, wishlisted: false },
    ]),
    false,
  );
  assert.equal(watchingAllMissing([{ owned: true, wishlisted: false }]), false);
});

test("catalog character view order uses missing first, A to Z, or latest grab", () => {
  const rows = [
    { name: "Power", owned: true, lastGot: 10 },
    { name: "Aki", owned: false, lastGot: null },
    { name: "Denji", owned: true, lastGot: 40 },
    { name: "Kobeni", owned: false, lastGot: null },
  ];
  assert.deepEqual(
    sortCatalogViewCharacters(rows, "completion").map((row) => row.name),
    ["Aki", "Kobeni", "Denji", "Power"],
  );
  assert.deepEqual(
    sortCatalogViewCharacters(rows, "alpha").map((row) => row.name),
    ["Aki", "Denji", "Kobeni", "Power"],
  );
  assert.deepEqual(
    sortCatalogViewCharacters(rows, "recent").map((row) => row.name),
    ["Denji", "Power", "Aki", "Kobeni"],
  );
});
