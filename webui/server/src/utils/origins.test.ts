import assert from "node:assert/strict";
import test from "node:test";
import { allowsCrossSite, originAllowed, parseOriginList } from "./origins.js";

const defaults = ["http://localhost:5173", "https://discord.com"];

test("a potatogamer.uk wildcard allows the apex and any subdomain over https", () => {
  const rules = parseOriginList("https://*.potatogamer.uk");
  assert.equal(originAllowed("https://play.potatogamer.uk", rules, defaults), true);
  assert.equal(originAllowed("https://a.b.potatogamer.uk", rules, defaults), true);
  assert.equal(originAllowed("https://potatogamer.uk", rules, defaults), true);
  assert.equal(originAllowed("http://play.potatogamer.uk", rules, defaults), false);
  assert.equal(originAllowed("https://evilpotatogamer.uk", rules, defaults), false);
  assert.equal(originAllowed("https://potatogamer.uk.evil.com", rules, defaults), false);
});

test("an exact address still has to match in full", () => {
  const rules = parseOriginList("https://akira.vercel.app, http://localhost:5173");
  assert.equal(originAllowed("https://akira.vercel.app", rules, defaults), true);
  assert.equal(originAllowed("https://preview.akira.vercel.app", rules, defaults), false);
  assert.equal(allowsCrossSite(rules), true);
  assert.equal(allowsCrossSite(parseOriginList("http://localhost:5173")), false);
  assert.equal(allowsCrossSite(parseOriginList("https://*.potatogamer.uk")), true);
});
