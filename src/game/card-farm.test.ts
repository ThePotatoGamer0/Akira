import assert from "node:assert/strict";
import test from "node:test";
import {
  cancelFarmSession,
  claimFarmJobs,
  clearFarmSession,
  farmTokenOk,
  finishFarmJob,
  peekFarmJob,
  startFarmSession,
  tokensMatch,
} from "./card-farm.js";
import type { FarmRedrawJob } from "./card-cache.js";

function job(id: number): FarmRedrawJob {
  return {
    id,
    group: {
      variantId: `card-${id}`,
      frameId: 0,
      printNumber: id,
      dye: null,
      files: [{ fileName: "normal.png", kind: "normal", format: "gif" }],
    },
    variant: {
      image: "0.png",
      seriesSlug: "demo",
      characterSlug: "hero",
      characterName: "Hero",
      seriesName: "Demo",
    },
  };
}

test("a farm token only matches itself", () => {
  assert.equal(tokensMatch("abc", "abc"), true);
  assert.equal(tokensMatch("7K2M9QPH", "7k2m9qph"), true);
  assert.equal(tokensMatch("abc", "abd"), false);
  assert.equal(tokensMatch("abc", "ab"), false);
});

test("the farm hands out jobs and counts finished pictures", () => {
  clearFarmSession();
  const token = "farm-token-one";
  startFarmSession([job(0), job(1)], 2, 4, token);
  assert.equal(farmTokenOk(token), true);
  assert.equal(farmTokenOk("nope"), false);
  const first = claimFarmJobs(token, 1);
  assert.equal(first?.length, 1);
  assert.equal(first?.[0]?.id, 0);
  assert.ok(peekFarmJob(0));
  assert.equal(peekFarmJob(1), null);
  const view = finishFarmJob(token, 0, { redrawn: 1, skipped: 0 });
  assert.equal(view?.redrawn, 1);
  assert.equal(view?.doneFiles, 3);
  const rest = claimFarmJobs(token, 8);
  assert.equal(rest?.length, 1);
  finishFarmJob(token, 1, { redrawn: 0, skipped: 1 });
  const done = claimFarmJobs(token, 8);
  assert.equal(done?.length, 0);
  clearFarmSession();
});

test("cancelling the farm drops the token", () => {
  clearFarmSession();
  startFarmSession([job(0)], 0, 1, "keep");
  cancelFarmSession();
  assert.equal(farmTokenOk("keep"), false);
  assert.equal(claimFarmJobs("keep", 1), null);
});
