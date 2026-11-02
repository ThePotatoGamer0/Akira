import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_TRADE_BITS, TRADE_DAILY_PAIR_VALUE } from "./balance.js";
import { allowCommand, rateLimitFor, resetRateLimits } from "../bot/rate-limit.js";
import type { AkiraCommand } from "../types/commands.js";
import {
  BLOCK_MIN_VALUE,
  bitsCapNote,
  cardValue,
  catchUpMultiplier,
  fairness,
  pairBudget,
  sideValue,
} from "./trade-value.js";

function command(name: string, rateLimitMs?: number | null): AkiraCommand {
  return {
    data: { name } as AkiraCommand["data"],
    execute: async () => undefined,
    ...(rateLimitMs === undefined ? {} : { rateLimitMs }),
  };
}

test("an empty side is a gift and always fair, at any size", () => {
  for (const [from, to] of [[10_000, 0], [0, 500], [0, 0]] as const) {
    const result = fairness(from, to);
    assert.equal(result.level, "fair");
    assert.equal(result.note, "");
  }
  // One legendary against nothing is still a gift, not a 500x block.
  assert.equal(fairness(500, 0).level, "fair");
});

test("two-sided trades warn past 2x and block past 5x once they are big", () => {
  assert.equal(fairness(100, 100).level, "fair");
  assert.equal(fairness(201, 100).level, "warn");
  assert.equal(fairness(500, 100).level, "warn");
  assert.equal(fairness(501, 100).ratio, 5);
  // 501 vs 100 is 5.01x but only 501 points, so it still only warns.
  assert.equal(fairness(501, 100).level, "warn");
  const big = fairness(BLOCK_MIN_VALUE * 6, BLOCK_MIN_VALUE);
  assert.equal(big.level, "block");
  assert.match(big.note, /lopsided/);
});

test("card value rises for a unique print and never sits below the burn value", () => {
  const common = cardValue("COMMON", 1, 100);
  assert.ok(common >= 20 && common < 30);
  assert.ok(cardValue("COMMON", 1, 1) > cardValue("COMMON", 1, 100));
  assert.ok(cardValue("COMMON", 1, 100) > cardValue("COMMON", 400, 100));
  assert.ok(cardValue("LEGENDARY", 1, 50) > cardValue("COMMON", 1, 50));
  assert.equal(cardValue("not-a-quality", 1, 5), cardValue("COMMON", 1, 5));
});

test("a side is its cards plus its bits", () => {
  assert.equal(sideValue([100, 50], 25), 175);
  assert.equal(sideValue([], 2_000), 2_000);
});

test("bits are capped only once the other side has something on it", () => {
  assert.equal(bitsCapNote(MAX_TRADE_BITS, false), null);
  assert.match(String(bitsCapNote(MAX_TRADE_BITS + 1, false)), /tops out/);
  // A gift can be any size: the other side is empty, so nothing is capped.
  assert.equal(bitsCapNote(50_000, true), null);
});

test("the pair budget counts both directions and empties at the daily value", () => {
  assert.equal(pairBudget(0, 1_000).over, false);
  assert.equal(pairBudget(3_000, 1_000).over, false);
  assert.equal(pairBudget(3_000, 1_000).remaining, 0);
  const over = pairBudget(TRADE_DAILY_PAIR_VALUE - 100, 500);
  assert.equal(over.over, true);
  assert.equal(over.remaining, 0);
  assert.match(over.note, /daily/);
});

test("the daily catch-up fades with cards and with time", () => {
  assert.equal(catchUpMultiplier(0, 0), 1.5);
  assert.ok(catchUpMultiplier(249, 0) > 1);
  assert.equal(catchUpMultiplier(250, 0), 1);
  assert.equal(catchUpMultiplier(10, 30), 1);
  assert.ok(catchUpMultiplier(125, 0) < 1.5);
  assert.ok(catchUpMultiplier(0, 15) < 1.5);
});

test("every command has a default limit and /ping has none", () => {
  assert.equal(rateLimitFor(command("drop")), 5_000);
  assert.equal(rateLimitFor(command("multitrade")), 30_000);
  assert.equal(rateLimitFor(command("give")), 30_000);
  assert.equal(rateLimitFor(command("ping")), null);
  assert.equal(rateLimitFor(command("drop", null)), null);
  assert.equal(rateLimitFor(command("drop", 1_000)), 1_000);
});

test("a command inside its limit is dropped, a different one still runs", () => {
  resetRateLimits();
  const drop = command("drop");
  const burn = command("burn");
  assert.equal(allowCommand("alice", drop, 1_000), true);
  assert.equal(allowCommand("alice", drop, 1_500), false);
  // Another player and another command are unaffected.
  assert.equal(allowCommand("bob", drop, 1_500), true);
  assert.equal(allowCommand("alice", burn, 1_500), true);
  assert.equal(allowCommand("alice", drop, 6_000), true);
  resetRateLimits();
});

test("/ping is never throttled", () => {
  resetRateLimits();
  const ping = command("ping");
  assert.equal(allowCommand("alice", ping, 1_000), true);
  assert.equal(allowCommand("alice", ping, 1_001), true);
  assert.equal(allowCommand("alice", ping, 1_002), true);
});
