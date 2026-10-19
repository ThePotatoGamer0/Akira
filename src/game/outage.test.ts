import assert from "node:assert/strict";
import test from "node:test";
import { OUTAGE_MIN_MS } from "./balance.js";
import { outageGap } from "./outage.js";

const now = new Date("2026-10-19T18:00:00.000Z");

test("a clean exit does not open a claim", () => {
  const beatAt = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  assert.equal(outageGap({ beatAt, cleanExit: true }, now), null);
});

test("a short gap is a restart", () => {
  const beatAt = new Date(now.getTime() - 2 * 60 * 1000);
  assert.equal(outageGap({ beatAt, cleanExit: false }, now), null);
});

test("a power cut long enough opens a claim", () => {
  const beatAt = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  assert.equal(outageGap({ beatAt, cleanExit: false }, now), 5 * 60 * 60 * 1000);
  assert.equal(outageGap({ beatAt: new Date(now.getTime() - OUTAGE_MIN_MS), cleanExit: false }, now), OUTAGE_MIN_MS);
  assert.equal(outageGap(null, now), null);
});
