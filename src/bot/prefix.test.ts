import assert from "node:assert/strict";
import test from "node:test";
import { collection } from "./commands/collection.js";
import { drop } from "./commands/drop.js";
import { set } from "./commands/set.js";
import { frame } from "./commands/frame.js";
import { inventory } from "./commands/inventory.js";
import { multiburn } from "./commands/multiburn.js";
import { tag, tagcreate, tagdelete, taglist, untag } from "./commands/tag.js";
import { editionIndexForVariant, lookup } from "./commands/lookup.js";
import { reminders } from "./commands/reminders.js";
import { multitrade } from "./commands/multitrade.js";
import { give, trade } from "./commands/transfer.js";
import { view } from "./commands/view.js";
import { wishlist } from "./commands/wishlist.js";
import { checklist } from "./commands/checklist.js";
import { invocationIsExpected, matchPrefixedCommand, parsePrefixedCommand, prefixOptionValues, resolveLegacyCommand, splitPrefixArgs, viewCardArgument } from "./prefix.js";

test("legacy commands use the a prefix glued to the name", () => {
  assert.deepEqual(parsePrefixedCommand("adrop", "a"), { name: "drop", rest: "" });
  assert.deepEqual(parsePrefixedCommand("aset", "a"), { name: "set", rest: "" });
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
  assert.deepEqual(resolveLegacyCommand("mt"), { command: "multitrade" });
  assert.deepEqual(resolveLegacyCommand("i"), { command: "inventory" });
  assert.deepEqual(resolveLegacyCommand("t"), { command: "tag" });
  assert.deepEqual(resolveLegacyCommand("tl"), { command: "taglist" });
  assert.deepEqual(resolveLegacyCommand("tags"), { command: "taglist" });
  assert.deepEqual(resolveLegacyCommand("tagadd"), { command: "tagcreate" });
  assert.deepEqual(resolveLegacyCommand("ta"), { command: "tagcreate" });
  assert.deepEqual(resolveLegacyCommand("tc"), { command: "tagcreate" });
  assert.deepEqual(resolveLegacyCommand("tagremove"), { command: "tagdelete" });
  assert.deepEqual(resolveLegacyCommand("tr"), { command: "tagdelete" });
  assert.deepEqual(resolveLegacyCommand("td"), { command: "tagdelete" });
  assert.deepEqual(resolveLegacyCommand("ut"), { command: "untag" });
  assert.deepEqual(resolveLegacyCommand("rm"), { command: "reminders" });
  assert.equal(resolveLegacyCommand("jobboard").command, "jobboard");
  assert.equal(resolveLegacyCommand("clan").command, "clan");
});

test("a prefix command runs only when the arguments are exactly what it accepts", () => {
  assert.equal(invocationIsExpected(set, ""), true);
  assert.equal(invocationIsExpected(drop, ""), true);
  assert.equal(invocationIsExpected(drop, "please"), false);
  assert.equal(invocationIsExpected(view, ""), false);
  assert.equal(invocationIsExpected(view, "fmbl40r"), true);
  assert.equal(invocationIsExpected(view, "fmbl40r extra"), false);
  assert.equal(invocationIsExpected(collection, ""), true);
  assert.equal(invocationIsExpected(collection, "<@123>"), true);
  assert.equal(invocationIsExpected(collection, "hello"), false);
  assert.equal(invocationIsExpected(collection, "s:Death Note"), true);
  assert.equal(invocationIsExpected(collection, "s is My Hero Academia q:4"), true);
  assert.equal(invocationIsExpected(collection, "<@123> c is Izuku Midoriya o:#"), true);
  assert.equal(invocationIsExpected(collection, "o:i"), true);
  assert.equal(invocationIsExpected(lookup, ""), false);
  assert.equal(invocationIsExpected(lookup, "denji"), true);
  assert.equal(invocationIsExpected(lookup, "tanjirou kamado"), true);
  assert.equal(invocationIsExpected(wishlist, ""), true);
  assert.equal(invocationIsExpected(wishlist, "add"), false);
  assert.equal(invocationIsExpected(wishlist, "add Tanjirou Kamado"), true);
  assert.equal(invocationIsExpected(wishlist, "Denji", "add"), true);
  assert.equal(invocationIsExpected(checklist, ""), true);
  assert.equal(invocationIsExpected(checklist, "add"), false);
  assert.equal(invocationIsExpected(checklist, "add Demon Slayer"), true);
  assert.equal(invocationIsExpected(checklist, "remove Cyberpunk"), true);
  assert.equal(invocationIsExpected(checklist, "hello"), false);
  assert.equal(invocationIsExpected(inventory, ""), true);
  assert.equal(invocationIsExpected(inventory, "is cool"), false);
  assert.equal(invocationIsExpected(tag, "fav"), true);
  assert.equal(invocationIsExpected(tag, "fav abc1234 def5678"), true);
  assert.equal(invocationIsExpected(tag, ""), false);
  assert.equal(invocationIsExpected(tag, "the store"), false);
  assert.equal(invocationIsExpected(taglist, ""), true);
  assert.equal(invocationIsExpected(taglist, "<@123>"), true);
  assert.equal(invocationIsExpected(taglist, "hello"), false);
  assert.equal(invocationIsExpected(tagcreate, "fav ⭐"), true);
  assert.equal(invocationIsExpected(tagcreate, "fav"), false);
  assert.equal(invocationIsExpected(tagcreate, "fav ⭐ extra"), false);
  assert.equal(invocationIsExpected(tagdelete, "fav"), true);
  assert.equal(invocationIsExpected(tagdelete, "fav please"), false);
  assert.equal(invocationIsExpected(untag, ""), true);
  assert.equal(invocationIsExpected(untag, "abc1234 def5678"), true);
  assert.equal(invocationIsExpected(untag, "hello"), false);
  assert.equal(invocationIsExpected(multiburn, "fav"), true);
  assert.equal(invocationIsExpected(multiburn, ""), false);
  assert.equal(invocationIsExpected(multiburn, "fav please"), false);
  assert.equal(invocationIsExpected(reminders, ""), true);
  assert.equal(invocationIsExpected(reminders, "drop"), true);
  assert.equal(invocationIsExpected(reminders, "drop extra"), false);
  assert.equal(invocationIsExpected(frame, ""), true);
  assert.equal(invocationIsExpected(frame, "default 1"), true);
  assert.equal(invocationIsExpected(frame, "default"), false);
  assert.equal(invocationIsExpected(frame, "card fmbl40r 2"), true);
  assert.equal(invocationIsExpected(frame, "card fmbl40r clear"), true);
  assert.equal(invocationIsExpected(frame, "card fmbl40r clear extra"), false);
  assert.equal(invocationIsExpected(frame, "personal"), false);
  assert.equal(invocationIsExpected(frame, "personal pink"), true);
  assert.equal(invocationIsExpected(frame, "personal clear"), true);
  assert.equal(invocationIsExpected(multitrade, "<@123>"), true);
  assert.equal(invocationIsExpected(multitrade, ""), false);
  assert.equal(invocationIsExpected(give, "<@123> fmbl40r"), true);
  assert.equal(invocationIsExpected(give, "fmbl40r"), false);
  assert.equal(invocationIsExpected(give, "<@123> fmbl40r extra"), false);
  assert.equal(invocationIsExpected(trade, "<@123> fmbl40r abc1234"), true);
  assert.equal(invocationIsExpected(trade, "<@123> fmbl40r, abc1234"), true);
  assert.equal(invocationIsExpected(trade, "<@123> fmbl40r,abc1234"), true);
  assert.equal(invocationIsExpected(trade, "fmbl40r abc1234"), true);
  assert.equal(invocationIsExpected(trade, "fmbl40r, abc1234"), true);
  assert.equal(invocationIsExpected(trade, "<@123> fmbl40r"), false);
  assert.equal(invocationIsExpected(trade, "fmbl40r"), false);
  assert.equal(invocationIsExpected(trade, "<@123> fmbl40r abc1234 extra"), false);
});

test("karuta prefixes are accepted only when they are enabled for the match", () => {
  assert.deepEqual(matchPrefixedCommand("kdrop", ["a"]), null);
  assert.deepEqual(matchPrefixedCommand("k!drop", ["a", "k!", "k"]), { name: "drop", rest: "" });
  assert.deepEqual(matchPrefixedCommand("kv fmbl40r", ["a", "k!", "k"]), { name: "v", rest: "fmbl40r" });
  assert.deepEqual(matchPrefixedCommand("k! view", ["a", "k!", "k"]), { name: "view", rest: "" });
  assert.deepEqual(matchPrefixedCommand("adrop", ["a", "k!", "k"]), { name: "drop", rest: "" });
  assert.deepEqual(matchPrefixedCommand("aoverridekaruta", ["a"]), { name: "overridekaruta", rest: "" });
});

test("a trade prefix splits card codes on commas", () => {
  const fields = [
    { name: "user", type: 6, required: false },
    { name: "card_id", type: 3, required: true },
    { name: "their_card", type: 3, required: true },
  ];
  const withMention = splitPrefixArgs("<@123> fmbl40r, abc1234");
  assert.deepEqual(withMention, ["<@123>", "fmbl40r", "abc1234"]);
  const mentioned = prefixOptionValues(fields, withMention);
  assert.equal(mentioned.get("card_id"), "fmbl40r");
  assert.equal(mentioned.get("their_card"), "abc1234");
  const bare = prefixOptionValues(fields, splitPrefixArgs("fmbl40r, abc1234"));
  assert.equal(bare.get("user"), undefined);
  assert.equal(bare.get("card_id"), "fmbl40r");
  assert.equal(bare.get("their_card"), "abc1234");
});

test("a bare view uses the card that was just grabbed", () => {
  assert.equal(viewCardArgument("", "fmbl40r"), "fmbl40r");
  assert.equal(viewCardArgument("", null), null);
  assert.equal(viewCardArgument("abc1234", "fmbl40r"), "abc1234");
});

test("a bare lookup opens the edition of the grabbed card", () => {
  const variants = [
    { id: "denji-transformed", name: "Transformed" },
    { id: "denji-base", name: "Denji" },
  ];
  assert.equal(editionIndexForVariant(variants, "denji-base"), 0);
  assert.equal(editionIndexForVariant(variants, "denji-transformed"), 1);
  assert.equal(editionIndexForVariant(variants, "missing"), 0);
});
