import assert from "node:assert/strict";
import test from "node:test";
import { akiraAddressName, sanitizePreferredName } from "./akira-address-name.js";

test("custom names become one capitalised latin word", () => {
  assert.equal(sanitizePreferredName("james"), "James");
  assert.equal(sanitizePreferredName("JAMES"), "James");
  assert.equal(sanitizePreferredName("the potato"), "Thepotato");
  assert.equal(sanitizePreferredName("James123!! 🎉"), "James");
  assert.equal(sanitizePreferredName("José"), "Jose");
  assert.equal(sanitizePreferredName("abcdefghijklmnop"), "Abcdefghijklmno");
  assert.equal(sanitizePreferredName("123 🎉"), null);
  assert.equal(sanitizePreferredName("   "), null);
});

test("an unusable custom name falls back to the discord username", () => {
  assert.equal(akiraAddressName({ preferredName: "!!!", discordUsername: "thepotatogamer" }), "thepotatogamer");
  assert.equal(akiraAddressName({ preferredName: "potato gamer", discordUsername: "thepotatogamer" }), "Potatogamer");
  assert.equal(akiraAddressName({ preferredName: null, discordUsername: null }), "friend");
});
