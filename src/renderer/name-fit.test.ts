import assert from "node:assert/strict";
import test from "node:test";
import { fitCharacterName, fitSingleLine, splitName } from "./name-fit.js";

const width = (text: string, fontSize: number) => text.length * fontSize;

test("a two-word name splits into those two words", () => {
  assert.deepEqual(splitName("Tanjirou Kamado", (text) => text.length), ["Tanjirou", "Kamado"]);
});

test("a longer name breaks where the lines are closest", () => {
  assert.deepEqual(splitName("Mary Anne Smith", (text) => text.length), ["Mary Anne", "Smith"]);
});

test("a short name grows to fill the name band", () => {
  const lines = fitCharacterName({
    name: "Denji",
    fontSize: 26,
    maxWidth: 300,
    maxHeight: 60,
    measure: width,
  });
  assert.deepEqual(lines, [{ text: "Denji", fontSize: 60 }]);
});

test("a long name uses two lines, then a smaller size when the band is short", () => {
  const lines = fitCharacterName({
    name: "Tanjirou Kamado",
    fontSize: 48,
    maxWidth: 200,
    maxHeight: 80,
    measure: width,
  });
  assert.equal(lines.length, 2);
  assert.equal(lines[0]?.text, "Tanjirou");
  assert.equal(lines[1]?.text, "Kamado");
  assert.ok((lines[0]?.fontSize ?? 48) < 48);
  assert.ok(width("Tanjirou", lines[0]?.fontSize ?? 0) <= 200);
  assert.ok(width("Kamado", lines[1]?.fontSize ?? 0) <= 200);
});

test("one long word shrinks instead of breaking mid-word", () => {
  const lines = fitCharacterName({
    name: "Supercalifragilistic",
    fontSize: 48,
    maxWidth: 200,
    maxHeight: 80,
    measure: width,
  });
  assert.equal(lines.length, 1);
  assert.equal(lines[0]?.text, "Supercalifragilistic");
  assert.ok((lines[0]?.fontSize ?? 48) < 48);
});

test("a long series title shrinks to one line", () => {
  const fitted = fitSingleLine({
    text: "Hello",
    fontSize: 20,
    maxWidth: 60,
    measure: width,
  });
  assert.equal(fitted.text, "Hello");
  assert.equal(fitted.fontSize, 12);
  assert.ok(width(fitted.text, fitted.fontSize) <= 60);
});
