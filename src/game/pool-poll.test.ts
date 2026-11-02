import assert from "node:assert/strict";
import test from "node:test";
import { pollWinners, type PollAnswer } from "./pool-poll.js";

const answer = (id: number, text: string, voteCount: number): PollAnswer => ({ id, text, voteCount });

test("the most voted buff wins the single slot", () => {
  const winners = pollWinners(
    ["Drop cooldown", "Grab cooldown", "Four cards"],
    [answer(0, "Drop cooldown", 4), answer(1, "Grab cooldown", 9), answer(2, "Four cards", 2)],
    1,
  );
  assert.deepEqual(winners, ["grab_cooldown"]);
});

test("fifty thousand takes the top two, most voted first", () => {
  const winners = pollWinners(
    ["Shiny luck", "Quality over quantity", "Four cards", "Tracked pull"],
    [answer(0, "Shiny luck", 5), answer(1, "Quality over quantity", 8), answer(2, "Four cards", 1), answer(3, "Tracked pull", 6)],
    2,
  );
  assert.deepEqual(winners, ["quality_over_quantity", "tracked_pull"]);
});

test("a tie goes to the answer listed first", () => {
  const winners = pollWinners(["Four cards", "Burn value"], [answer(1, "Burn value", 3), answer(0, "Four cards", 3)], 1);
  assert.deepEqual(winners, ["four_cards"]);
});

test("an answer nobody voted for is never a winner", () => {
  assert.deepEqual(pollWinners(["Four cards"], [answer(0, "Four cards", 0)], 1), []);
  assert.deepEqual(pollWinners(["Four cards"], null, 1), []);
  assert.deepEqual(pollWinners(["Four cards"], [answer(0, "Four cards", 5)], 0), []);
});

test("a winner the roll cannot place is skipped for the next one down", () => {
  const winners = pollWinners(["Something odd", "Shiny luck"], [answer(0, "Something odd", 9), answer(1, "Shiny luck", 1)], 2);
  assert.deepEqual(winners, ["shiny_luck"]);
});

test("poll labels read back as the buffs they name", () => {
  const labels = [
    "Drop cooldown",
    "Grab cooldown",
    "Burn value",
    "Four cards",
    "Shiny luck",
    "Featured series",
    "Quality over quantity",
    "Tracked pull",
  ];
  const expected = [
    "drop_cooldown",
    "grab_cooldown",
    "burn_value",
    "four_cards",
    "shiny_luck",
    "featured_series",
    "quality_over_quantity",
    "tracked_pull",
  ];
  const winners = pollWinners(
    labels,
    labels.map((text, id) => answer(id, text, labels.length - id)),
    labels.length,
  );
  assert.deepEqual(winners, expected);
});
