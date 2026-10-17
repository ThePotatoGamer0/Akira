import assert from "node:assert/strict";
import test from "node:test";
import { formatChecklist, matchSeriesQuery } from "./checklist.js";

const series = [
  { id: "ds", name: "Demon Slayer" },
  { id: "cp", name: "Cyberpunk" },
];

const withMugen = [...series, { id: "train", name: "Demon Slayer: Mugen" }];

test("a unique start of a series name is enough", () => {
  assert.equal(matchSeriesQuery("Demon S", series).match?.name, "Demon Slayer");
  assert.equal(matchSeriesQuery("demon slayer", withMugen).match?.name, "Demon Slayer");
  assert.equal(matchSeriesQuery("cyber", series).match?.name, "Cyberpunk");
  assert.equal(matchSeriesQuery("  Cyberpunk  ", series).match?.name, "Cyberpunk");
});

test("several series that fit stay unresolved", () => {
  const many = matchSeriesQuery("Demon S", withMugen);
  assert.equal(many.match, null);
  if (many.match === null && many.kind === "many") {
    assert.deepEqual(many.names, ["Demon Slayer", "Demon Slayer: Mugen"]);
  } else {
    assert.fail("expected several matches");
  }
  assert.equal(matchSeriesQuery("bleach", series).match, null);
  assert.equal(matchSeriesQuery("   ", series).match, null);
});

test("the checklist names each series, then the missing characters", () => {
  assert.deepEqual(
    formatChecklist([
      { name: "Demon Slayer", missing: ["Tanjirou"] },
      { name: "Cyberpunk", missing: ["Maine"] },
      { name: "Death Note", missing: [] },
    ]),
    ["Demon Slayer\n• Tanjirou\n\nCyberpunk\n• Maine\n\nDeath Note\nYou have every character."],
  );
});
