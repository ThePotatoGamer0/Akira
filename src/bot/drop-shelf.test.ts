import assert from "node:assert/strict";
import test from "node:test";
import { workerExecArgv, workerUrl } from "./drop-shelf.js";
import { featuredWeight, pickFeatured, type FeaturedCandidate } from "../game/featured.js";

const series = (id: string, tracked: number, pictures = 20): FeaturedCandidate => ({ id, tracked, pictures });

/** How often each candidate is picked over `runs` rolls. */
function shares(candidates: FeaturedCandidate[], runs = 20_000): Map<string, number> {
  const counts = new Map<string, number>();
  for (let run = 0; run < runs; run += 1) {
    const index = pickFeatured(candidates);
    const id = candidates[index]?.id;
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

test("tracked series come up far more often than untracked ones", () => {
  // Whichever of a tracked few a player pins, it is the one drop they spend a slot on.
  const tracked = Array.from({ length: 8 }, (_, index) => series(`t${index}`, 3));
  const untouched = Array.from({ length: 50 }, (_, index) => series(`x${index}`, 0));
  const candidates = [...tracked, ...untouched];
  const counts = shares(candidates, 10_000);
  const trackedHits = tracked.reduce((sum, row) => sum + (counts.get(row.id) ?? 0), 0);
  const untrackedHits = untouched.reduce((sum, row) => sum + (counts.get(row.id) ?? 0), 0);
  const share = trackedHits / (trackedHits + untrackedHits);
  // Chance alone would give them 8 of 58 clean slots, about 14%.
  assert.ok(share > 0.2, `tracked share was ${share.toFixed(2)}`);
  assert.ok(share < 0.3, `tracked share was ${share.toFixed(2)}`);
  // A series three players track comes up more often than one nobody does.
  assert.ok((counts.get("t0") ?? 0) > 1.5 * (counts.get("x0") ?? 0), `t0 ${counts.get("t0")} vs x0 ${counts.get("x0")}`);
  // And no single tracked series swallows every drop: a browse series still comes up.
  const busiest = Math.max(...tracked.map((row) => counts.get(row.id) ?? 0));
  assert.ok(busiest / 10_000 < 0.1, `one series took ${(busiest / 100).toFixed(1)}% of drops`);
  assert.ok((counts.get("x0") ?? 0) > 0);
});

test("weight grows with players", () => {
  assert.equal(featuredWeight(series("a", 0)), 1);
  assert.equal(featuredWeight(series("a", 3)), 1.75);
  assert.ok(featuredWeight(series("a", 5)) > featuredWeight(series("a", 1)));
  assert.ok(featuredWeight(series("a", 5)) < featuredWeight(series("a", 6)));
});

test("a series with too little art is never featured", () => {
  const thin = series("thin", 50, 2);
  const full = series("full", 0, 20);
  assert.equal(featuredWeight(thin), 0);
  for (let run = 0; run < 200; run += 1) assert.equal(pickFeatured([thin, full]), 1);
  assert.equal(pickFeatured([thin]), -1, "nothing to draw when no series has art");
  assert.equal(pickFeatured([]), -1);
});

test("a roll at the very top of the range still lands on a series", () => {
  assert.ok(pickFeatured([series("a", 1)], () => 0.999999) >= 0);
  assert.equal(pickFeatured([series("a", 1)], () => 1), 0);
  assert.equal(pickFeatured([series("a", 1), series("b", 1)], () => 0), 0);
});

test("the drop shelf worker can import the game sources", { skip: !process.env["AKIRA_SHELF_WORKER"] }, async () => {
  const argv = workerExecArgv();
  assert.ok(argv.includes("tsx") || argv.some((arg) => arg.includes("/tsx/dist/")));
  assert.ok(argv.some((arg) => arg.endsWith("drop-shelf-register.mjs")));
  const worker = new Worker(workerUrl(), { execArgv: argv });
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
