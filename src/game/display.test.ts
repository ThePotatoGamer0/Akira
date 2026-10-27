import assert from "node:assert/strict";
import test from "node:test";
import { isCardCode, mintCardCode, randomCardCode } from "./codes.js";
import { cardSummaryLine, cooldownLine, dropAnnouncement, fightOffAnnouncement, formatDuration, grabAnnouncement, processingTimeNote, qualityStars, wishlistClaimedLine, wishlistDropDm, wishlistReceipt } from "./display.js";

test("processing time is a small gray millisecond count", () => {
  assert.equal(processingTimeNote(42), "-# 0042ms");
  assert.equal(processingTimeNote(1842), "-# 1842ms");
});

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
  assert.equal(formatDuration(10 * 60 * 60_000), "10 hours");
  assert.equal(formatDuration((23 * 60 + 41) * 60_000), "23 hours 41 minutes");
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
  assert.equal(line, "◾`v8znvrx` · ★★★★★ · #52066 · `2` · Servamp · **Tetsu Sendagaya**");
  assert.equal(
    cardSummaryLine({
      cardId: "4bqz1p6",
      quality: "COMMON",
      printNumber: 1,
      frameId: 0,
      seriesName: "Death Note",
      characterName: "Halle Bullook",
      tagEmoji: "⭐",
    }),
    "⭐`4bqz1p6` · ★☆☆☆☆ · #1 · `0` · Death Note · **Halle Bullook**",
  );
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
  assert.equal(
    fightOffAnnouncement({
      dropperDiscordId: "1",
      sniperDiscordId: "2",
      characterName: "The Commander",
      cardId: "v8ppgb1",
      quality: "COMMON",
    }),
    "<@1> fought off <@2> and took the **The Commander** card `v8ppgb1`! Unfortunately, it was badly **damaged**.",
  );
});

test("the drop line names how many cards are in the picture", () => {
  assert.equal(dropAnnouncement("9"), "<@9> is dropping 3 cards!");
  assert.equal(dropAnnouncement("9", 1), "<@9> is dropping 1 card!");
  assert.equal(dropAnnouncement("9", 4), "<@9> is dropping 4 cards!");
});

test("a wishlist drop DM names the characters and jumps to the drop", () => {
  assert.equal(
    wishlistDropDm(["Denji"], "https://discord.com/channels/1/2/3"),
    "Someone dropped **Denji**! https://discord.com/channels/1/2/3",
  );
  assert.equal(
    wishlistDropDm(["Denji", "Power"], "https://discord.com/channels/1/2/3"),
    "Someone dropped characters you're watching for: **Denji**, **Power**. https://discord.com/channels/1/2/3",
  );
  assert.equal(
    wishlistClaimedLine({ name: "Denji", grabberDiscordId: "7", jumpUrl: "https://discord.com/channels/1/2/3" }),
    "<@7> grabbed **Denji** first. https://discord.com/channels/1/2/3",
  );
  assert.equal(
    wishlistReceipt(["Denji"]),
    "**Denji** is in your collection now, so Akira took it off your wishlist.",
  );
  assert.equal(
    wishlistReceipt(["Denji", "Power"]),
    "**Denji**, **Power** are in your collection now, so Akira took them off your wishlist.",
  );
});
