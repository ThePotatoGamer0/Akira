import assert from "node:assert/strict";
import test from "node:test";
import { collection } from "./commands/collection.js";
import { drop } from "./commands/drop.js";
import { frame } from "./commands/frame.js";
import { inventory, tags } from "./commands/later.js";
import { lookup } from "./commands/lookup.js";
import { reminders } from "./commands/reminders.js";
import { view } from "./commands/view.js";
import { wishlist } from "./commands/wishlist.js";
import { invocationIsExpected, matchPrefixedCommand, parsePrefixedCommand, resolveLegacyCommand, viewCardArgument } from "./prefix.js";

test("legacy commands use the a prefix glued to the name", () => {
  assert.deepEqual(parsePrefixedCommand("adrop", "a"), { name: "drop", rest: "" });
  assert.deepEqual(parsePrefixedCommand("ALookup Denji", "a"), { name: "lookup", rest: "Denji" });
  assert.deepEqual(parsePrefixedCommand("a wishlist add Denji", "a"), { name: "wishlist", rest: "add Denji" });
  assert.equal(parsePrefixedCommand("hello", "a"), null);
  assert.equal(parsePrefixedCommand("a", "a"), null);
  assert.deepEqual(parsePrefixedCommand("actually", "a"), { name: "ctually", rest: "" });
});

test("karuta shortcuts map onto akira commands", () => {
  assert.deepEqual(resolveLegacyCommand("d"), { command: "drop" });
  assert.deepEqual(resolveLegacyCommand("c"), { command: "collection" });
  assert.deepEqual(resolveLegacyCommand("v"), { command: "view" });
  assert.deepEqual(resolveLegacyCommand("lu"), { command: "lookup" });
  assert.deepEqual(resolveLegacyCommand("cd"), { command: "cooldowns" });
  assert.deepEqual(resolveLegacyCommand("wl"), { command: "wishlist" });
  assert.deepEqual(resolveLegacyCommand("wa"), { command: "wishlist", subcommand: "add" });
  assert.deepEqual(resolveLegacyCommand("wr"), { command: "wishlist", subcommand: "remove" });
  assert.deepEqual(resolveLegacyCommand("drop"), { command: "drop" });
  assert.deepEqual(resolveLegacyCommand("i"), { command: "inventory" });
  assert.deepEqual(resolveLegacyCommand("t"), { command: "tags" });
  assert.deepEqual(resolveLegacyCommand("rm"), { command: "reminders" });
  assert.equal(resolveLegacyCommand("jobboard").command, "jobboard");
  assert.equal(resolveLegacyCommand("clan").command, "clan");
});

test("a prefix command runs only when the arguments are exactly what it accepts", () => {
  assert.equal(invocationIsExpected(drop, ""), true);
  assert.equal(invocationIsExpected(drop, "please"), false);
  assert.equal(invocationIsExpected(view, ""), false);
  assert.equal(invocationIsExpected(view, "fmbl40r"), true);
  assert.equal(invocationIsExpected(view, "fmbl40r extra"), false);
  assert.equal(invocationIsExpected(collection, ""), true);
  assert.equal(invocationIsExpected(collection, "<@123>"), true);
  assert.equal(invocationIsExpected(collection, "hello"), false);
  assert.equal(invocationIsExpected(lookup, ""), false);
  assert.equal(invocationIsExpected(lookup, "denji"), true);
  assert.equal(invocationIsExpected(lookup, "tanjirou kamado"), true);
  assert.equal(invocationIsExpected(wishlist, ""), true);
  assert.equal(invocationIsExpected(wishlist, "add"), false);
  assert.equal(invocationIsExpected(wishlist, "add Tanjirou Kamado"), true);
  assert.equal(invocationIsExpected(wishlist, "Denji", "add"), true);
  assert.equal(invocationIsExpected(inventory, ""), true);
  assert.equal(invocationIsExpected(inventory, "is cool"), false);
  assert.equal(invocationIsExpected(tags, ""), true);
  assert.equal(invocationIsExpected(tags, "the store"), false);
  assert.equal(invocationIsExpected(reminders, ""), true);
  assert.equal(invocationIsExpected(reminders, "drop"), true);
  assert.equal(invocationIsExpected(reminders, "drop extra"), false);
  assert.equal(invocationIsExpected(frame, ""), true);
  assert.equal(invocationIsExpected(frame, "default 1"), true);
  assert.equal(invocationIsExpected(frame, "default"), false);
  assert.equal(invocationIsExpected(frame, "card fmbl40r 2"), true);
  assert.equal(invocationIsExpected(frame, "card fmbl40r clear"), true);
  assert.equal(invocationIsExpected(frame, "card fmbl40r clear extra"), false);
});

test("karuta prefixes are accepted only when they are enabled for the match", () => {
  assert.deepEqual(matchPrefixedCommand("kdrop", ["a"]), null);
  assert.deepEqual(matchPrefixedCommand("k!drop", ["a", "k!", "k"]), { name: "drop", rest: "" });
  assert.deepEqual(matchPrefixedCommand("kv fmbl40r", ["a", "k!", "k"]), { name: "v", rest: "fmbl40r" });
  assert.deepEqual(matchPrefixedCommand("k! view", ["a", "k!", "k"]), { name: "view", rest: "" });
  assert.deepEqual(matchPrefixedCommand("adrop", ["a", "k!", "k"]), { name: "drop", rest: "" });
  assert.deepEqual(matchPrefixedCommand("aoverridekaruta", ["a"]), { name: "overridekaruta", rest: "" });
});

test("a bare view uses the card that was just grabbed", () => {
  assert.equal(viewCardArgument("", "fmbl40r"), "fmbl40r");
  assert.equal(viewCardArgument("", null), null);
  assert.equal(viewCardArgument("abc1234", "fmbl40r"), "abc1234");
});
