import assert from "node:assert/strict";
import test from "node:test";
import { displaySeriesName, foldSearch, matchesSearch, seriesSearchFields, seriesTitleStyle } from "./series-meta.js";

test("Dress-Up Darling and Dress Up Darling both fold to the same search", () => {
  assert.equal(foldSearch("My Dress-Up Darling"), "my dress up darling");
  assert.equal(foldSearch("My Dress Up Darling"), "my dress up darling");
});

test("Sono Bisque Doll Wa Koi Wo Suru is found as My Dress-Up Darling", () => {
  const fields = seriesSearchFields(
    "sono-bisque-doll-wa-koi-wo-suru",
    "Sono Bisque Doll Wa Koi Wo Suru",
  );
  assert.equal(matchesSearch("My Dress-Up Darling", ...fields), true);
  assert.equal(matchesSearch("My Dress Up Darling", ...fields), true);
  assert.equal(matchesSearch("dress-up darling", ...fields), true);
  assert.equal(matchesSearch("chainsaw man", ...fields), false);
});

test("series title style is english unless romaji is chosen", () => {
  assert.equal(seriesTitleStyle(undefined), "english");
  assert.equal(seriesTitleStyle("english"), "english");
  assert.equal(seriesTitleStyle("romaji"), "romaji");
  assert.equal(seriesTitleStyle("other"), "english");
});

test("a series without stored titles keeps the fallback name", () => {
  assert.equal(displaySeriesName("no-such-series", "Fallback Show", "romaji"), "Fallback Show");
  assert.equal(displaySeriesName("no-such-series", "Fallback Show", "english"), "Fallback Show");
});

test("stored AniList titles switch with the series title style", () => {
  assert.equal(
    displaySeriesName("sono-bisque-doll-wa-koi-wo-suru", "Sono Bisque Doll Wa Koi Wo Suru", "english"),
    "My Dress-Up Darling",
  );
});
