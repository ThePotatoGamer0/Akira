import assert from "node:assert/strict";
import test from "node:test";
import { discordEmojiId, matchDiscordEmoji } from "./emoji.js";

test("standard emoji use the same twemoji ids Discord does", () => {
  assert.equal(discordEmojiId("😀"), "1f600");
  assert.equal(discordEmojiId("❤️"), "2764");
  assert.equal(discordEmojiId("1️⃣"), "31-20e3");
  assert.equal(discordEmojiId("🇬🇧"), "1f1ec-1f1e7");
  assert.equal(discordEmojiId("👋"), "1f44b");
});

test("plain text is left alone", () => {
  assert.equal(matchDiscordEmoji("Hello"), null);
  assert.equal(discordEmojiId("1"), null);
});
