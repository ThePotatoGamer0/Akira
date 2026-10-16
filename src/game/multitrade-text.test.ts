import assert from "node:assert/strict";
import test from "node:test";
import { parseTradeOffer } from "./multitrade-text.js";

test("a trade message accepts card codes and bits, split by commas", () => {
  assert.deepEqual(parseTradeOffer("v847vnm, 100 bits"), {
    cards: ["v847vnm"],
    bits: 100,
    unknown: [],
  });
  assert.deepEqual(parseTradeOffer("V847VNM,100 bit"), {
    cards: ["v847vnm"],
    bits: 100,
    unknown: [],
  });
  assert.deepEqual(parseTradeOffer("100 bits, 50 bits"), {
    cards: [],
    bits: 150,
    unknown: [],
  });
  assert.equal(parseTradeOffer("hello there"), null);
  assert.deepEqual(parseTradeOffer("v847vnm, hello"), {
    cards: ["v847vnm"],
    bits: 0,
    unknown: ["hello"],
  });
});
