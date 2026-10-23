import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { listCachedCardGroups } from "./card-cache.js";

function temp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "akira-cache-"));
}

function touch(root: string, relative: string): void {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "x");
}

test("cached cards are grouped with the still before the animations", () => {
  const dir = temp();
  touch(dir, "hero-base/0/preview/none/shiny.gif");
  touch(dir, "hero-base/0/preview/none/normal.png");
  touch(dir, "hero-base/1/p12/rose/burn.apng");
  const { groups, skipped } = listCachedCardGroups(dir);
  assert.equal(skipped, 0);
  assert.equal(groups.length, 2);
  const preview = groups.find((group) => group.printNumber === null);
  assert.ok(preview);
  assert.deepEqual(preview.files.map((file) => file.fileName), ["normal.png", "shiny.gif"]);
  assert.equal(preview.frameId, 0);
  assert.equal(preview.dye, null);
  const dyed = groups.find((group) => group.dye === "rose");
  assert.ok(dyed);
  assert.equal(dyed.printNumber, 12);
  assert.equal(dyed.files[0]?.kind, "burn");
  assert.equal(dyed.files[0]?.format, "apng");
});

test("a dye that cannot be redrawn is counted and left out", () => {
  const dir = temp();
  touch(dir, "hero-base/0/preview/custom/normal.png");
  touch(dir, "hero-base/0/preview/none/normal.png");
  const { groups, skipped } = listCachedCardGroups(dir);
  assert.equal(skipped, 1);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.dye, null);
});
