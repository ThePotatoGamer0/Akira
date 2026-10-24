import assert from "node:assert/strict";
import test from "node:test";
import { akiraAddressName, sanitizePreferredName } from "./akira-address-name.js";

test("custom names are one latin word, with at most the first letter a capital", () => {
  assert.equal(sanitizePreferredName("james"), "james");
  assert.equal(sanitizePreferredName("James"), "James");
  assert.equal(sanitizePreferredName("JAMES"), "James");
  assert.equal(sanitizePreferredName("jAMES"), "james");
  assert.equal(sanitizePreferredName("the potato"), "thepotato");
  assert.equal(sanitizePreferredName("James123!! 🎉"), "James");
  assert.equal(sanitizePreferredName("José"), "Jose");
  assert.equal(sanitizePreferredName("abcdefghijklmnop"), "abcdefghijklmno");
  assert.equal(sanitizePreferredName("123 🎉"), null);
  assert.equal(sanitizePreferredName("   "), null);
});

test("an unusable custom name falls back to the discord username", () => {
  assert.equal(akiraAddressName({ preferredName: "!!!", discordUsername: "thepotatogamer" }), "thepotatogamer");
  assert.equal(akiraAddressName({ preferredName: "potato gamer", discordUsername: "thepotatogamer" }), "potatogamer");
  assert.equal(akiraAddressName({ preferredName: null, discordUsername: null }), "friend");
});
