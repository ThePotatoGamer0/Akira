import assert from "node:assert/strict";
import test from "node:test";
import { isCardCode, mintCardCode, randomCardCode } from "./codes.js";
import { cardSummaryLine, cooldownLine, formatDuration, grabAnnouncement, qualityStars } from "./display.js";

test("card codes are 7 lowercase letters or digits", () => {
  const code = randomCardCode(() => 0);
  assert.equal(code, "0000000");
  assert.equal(isCardCode(code), true);
  assert.equal(isCardCode("cm123456789"), false);
  assert.equal(randomCardCode(() => 0.999).length, 7);
});

test("minting skips a code that is already taken", async () => {
  let n = 0;
  const code = await mintCardCode(
    async (id) => id === "0000000",
    () => {
      n += 1;
      return n <= 7 ? 0 : 0.2;
    },
  );
  assert.notEqual(code, "0000000");
  assert.equal(isCardCode(code), true);
});

test("durations read like a cooldown clock", () => {
  assert.equal(formatDuration(45_000), "45 seconds");
  assert.equal(formatDuration(60_000), "1 minute");
  assert.equal(formatDuration(10 * 60_000), "10 minutes");
  assert.equal(cooldownLine("Grab", 10 * 60_000), "**Grab** is available in `10 minutes`");
  assert.equal(cooldownLine("Drop", 0), "**Drop** is ready");
});

test("collection and grab lines use the short code", () => {
  const line = cardSummaryLine({
    cardId: "v8znvrx",
    quality: "LEGENDARY",
    printNumber: 52066,
    frameId: 2,
    seriesName: "Servamp",
    characterName: "Tetsu Sendagaya",
  });
  assert.equal(line, "`v8znvrx` · ★★★★★ · #52066 · `2` · Servamp · **Tetsu Sendagaya**");
  assert.match(qualityStars("COMMON"), /★☆☆☆☆/);
  assert.match(
    grabAnnouncement({
      discordId: "1",
      characterName: "Lobelia",
      cardId: "v8phzmj",
      quality: "COMMON",
    }),
    /took the \*\*Lobelia\*\* card `v8phzmj`! Unfortunately, it was badly \*\*damaged\*\*/,
  );
});
