import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rankCollection, collectionNarrowing } from "./collection-search.js";
import { rankCharacters, rankSeries } from "./search-records.js";
import { editDistance, fieldScore, parseQuery, scoreQuery } from "./search.js";

function character(name: string, slug: string, series = "chainsaw-man", seriesName = "Chainsaw Man") {
  return { name, slug, aliases: null, series: { slug: series, name: seriesName } };
}

describe("query parsing", () => {
  it("folds punctuation and drops stop words", () => {
    assert.deepEqual(
      parseQuery("The Chainsaw-Man").map((term) => term.text),
      ["chainsaw man"],
    );
    assert.deepEqual(parseQuery("Chainsaw Man").map((term) => term.text), ["chainsaw", "man"]);
  });

  it("keeps quoted phrases together", () => {
    assert.deepEqual(parseQuery('"power chainsaw"').map((term) => term.text), ["power chainsaw"]);
  });

  it("reads kind:value words, their aliases, and negation", () => {
    const terms = parseQuery("series:onepunch -tag:ssr");
    assert.deepEqual(
      terms.map((term) => [term.field, term.text, term.negated]),
      [
        ["series", "onepunch", false],
        ["tag", "ssr", true],
      ],
    );
  });

  it("leaves an unknown prefix as a plain word", () => {
    assert.deepEqual(parseQuery("re:zero").map((term) => [term.field, term.text]), [
      [null, "re zero"],
    ]);
  });
});

describe("matching", () => {
  it("finds words in any order", () => {
    assert.ok(scoreQuery(parseQuery("man chainsaw"), ["Chainsaw Man", "chainsaw-man"]) > 0);
  });

  it("finds half-typed words", () => {
    assert.ok(fieldScore("chai", "Chainsaw") > 0);
    assert.ok(fieldScore("chai", "Chainsaw Man") > 0, "through the glued words");
    assert.ok(fieldScore("darl", "My Dress-Up Darling") > 0);
  });

  it("forgives a typo, but only on long enough words", () => {
    assert.ok(fieldScore("chyansaw", "Chainsaw Man") > 0);
    assert.equal(fieldScore("mna", "Man"), 0);
  });

  it("needs every word to land", () => {
    assert.equal(scoreQuery(parseQuery("chainsaw naruto"), ["Chainsaw Man"]), 0);
  });

  it("vetoes a negated word", () => {
    assert.equal(scoreQuery(parseQuery("man -chainsaw"), ["Chainsaw Man"]), 0);
    assert.ok(scoreQuery(parseQuery("man -naruto"), ["Chainsaw Man"]) > 0);
  });

  it("ranks exact and prefix matches above loose ones", () => {
    assert.ok(fieldScore("man", "Man") > fieldScore("man", "Man in the Box"));
    assert.ok(fieldScore("man", "Man in the Box") > fieldScore("man", "Theman"));
  });

  it("measures edit distance", () => {
    assert.equal(editDistance("kitten", "sitting"), 3);
    assert.equal(editDistance("power", "power"), 0);
  });
});

describe("characters", () => {
  const rows = [
    character("Denji", "denji"),
    character("Power", "power"),
    character("Makima", "makima"),
    character("Naruto Uzumaki", "naruto-uzumaki", "naruto", "Naruto"),
  ];

  it("puts the exact name first even when the series also matches", () => {
    const ranked = rankCharacters("power", [character("Chainsaw Man", "chainsaw-man"), ...rows]);
    assert.equal(ranked[0]?.name, "Power");
  });

  it("finds characters through their series", () => {
    assert.deepEqual(
      rankCharacters("chainsaw", rows).map((row) => row.name),
      ["Denji", "Power", "Makima"],
    );
  });

  it("returns nothing for an empty query", () => {
    assert.deepEqual(rankCharacters("  ", rows), []);
  });
});

describe("series", () => {
  it("matches romaji, english, and slugs", () => {
    const rows = [
      { slug: "sono-bisque-doll", name: "My Dress-Up Darling" },
      { slug: "chainsaw-man", name: "Chainsaw Man" },
    ];
    assert.equal(rankSeries("dress up", rows)[0]?.name, "My Dress-Up Darling");
    assert.equal(rankSeries("chainsaw", rows)[0]?.name, "Chainsaw Man");
  });
});

describe("collection", () => {
  const card = (id: string, name: string, tag: string | null, quality = "RARE") => ({
    obtainedAt: new Date("2024-05-01"),
    id,
    tag,
    alias: null,
    quality,
    dye: null,
    printNumber: 1,
    variant: { name: "Standard", character: { name, slug: name.toLowerCase(), aliases: null, series: { name: "Chainsaw Man", slug: "chainsaw-man" } } },
  });
  const cards = [card("aaaaaa", "Denji", null), card("bbbbbb", "Power", "fave"), card("cccccc", "Makima", "trade", "COMMON")];

  it("matches characters, tags, and conditions", () => {
    assert.deepEqual(rankCollection("power", cards), ["bbbbbb"]);
    assert.deepEqual(rankCollection("trade", cards), ["cccccc"]);
    assert.deepEqual(rankCollection("damaged", cards), ["cccccc"]);
  });

  it("narrows with a typeahead's quoted phrase", () => {
    assert.deepEqual(rankCollection('"power"', cards), ["bbbbbb"]);
  });

  it("narrows with field words", () => {
    assert.deepEqual(rankCollection("tag:fave", cards), ["bbbbbb"]);
    assert.deepEqual(rankCollection("series:chainsaw -tag:trade", cards), ["aaaaaa", "bbbbbb"]);
    assert.deepEqual(rankCollection("tag:fav", cards), [], "a typed tag is matched whole");
    assert.deepEqual(rankCollection("tag:trad", cards), [], "3-letter words get no typo allowance");
  });

  it("finds a condition by its first letters", () => {
    assert.deepEqual(collectionNarrowing("dama").qualities, ["COMMON"]);
    assert.deepEqual(collectionNarrowing("power").qualities, []);
  });
});
