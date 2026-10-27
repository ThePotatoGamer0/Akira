import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Worker } from "node:worker_threads";
import {
  listCachedCardGroups,
  refreshWorkerCount,
  refreshWorkerExecArgv,
  refreshWorkerUrl,
} from "./card-cache.js";
import { redrawCachedGroup } from "./card-redraw.js";

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

test("a missing portrait is skipped instead of wiping the cache", async () => {
  const result = await redrawCachedGroup({
    variantId: "missing-hero-base",
    frameId: 0,
    printNumber: null,
    dye: null,
    files: [{ fileName: "normal.png", kind: "normal", format: "gif" }],
  }, {
    image: "missing.png",
    seriesSlug: "no-such-series",
    characterSlug: "no-such-character",
    characterName: "Missing",
    seriesName: "Missing",
  });
  assert.equal(result.redrawn, 0);
  assert.equal(result.skipped, 1);
});

test("refresh uses one worker per CPU", () => {
  assert.ok(refreshWorkerCount() >= 1);
  assert.ok(refreshWorkerCount() <= 8);
});

test("the card cache worker can import the game sources", async () => {
  const argv = refreshWorkerExecArgv();
  assert.ok(argv.includes("tsx") || argv.some((arg) => arg.includes("/tsx/dist/")));
  assert.ok(argv.some((arg) => arg.endsWith("card-cache-register.mjs")));
  const worker = new Worker(refreshWorkerUrl(), { execArgv: argv });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 1_000);
      worker.once("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  } finally {
    await worker.terminate();
  }
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
