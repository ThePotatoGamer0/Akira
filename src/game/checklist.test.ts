import assert from "node:assert/strict";
import test from "node:test";
import { checklistPageBody, matchSeriesQuery, paginateChecklist } from "./checklist.js";

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

test("the checklist uses one page per series", () => {
  const pages = paginateChecklist([
    { name: "Demon Slayer", missing: ["Tanjirou"] },
    { name: "Cyberpunk", missing: ["Maine"] },
    { name: "Death Note", missing: [] },
  ]);
  assert.equal(pages.length, 3);
  assert.equal(pages[0]?.series, "Demon Slayer");
  assert.equal(checklistPageBody(pages[0]!), "Still looking for 1.\n\n• Tanjirou");
  assert.equal(pages[1]?.series, "Cyberpunk");
  assert.equal(checklistPageBody(pages[1]!), "Still looking for 1.\n\n• Maine");
  assert.equal(pages[2]?.series, "Death Note");
  assert.equal(checklistPageBody(pages[2]!), "You have every character.");
});

test("a long series becomes extra pages for that show", () => {
  const missing = Array.from({ length: 200 }, (_, index) => `Character ${String(index + 1).padStart(3, "0")}`);
  const pages = paginateChecklist([{ name: "Huge Show", missing }]);
  assert.ok(pages.length > 1);
  assert.equal(pages.every((page) => page.series === "Huge Show"), true);
  assert.equal(pages[0]?.part, 1);
  assert.equal(pages[0]?.parts, pages.length);
  assert.equal(pages.at(-1)?.part, pages.length);
  assert.equal(pages.flatMap((page) => page.names).length, 200);
  assert.equal(pages[0]?.missing, 200);
  for (const page of pages) {
    assert.ok(checklistPageBody(page).length <= 1900);
  }
});
