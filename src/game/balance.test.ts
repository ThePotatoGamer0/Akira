import assert from "node:assert/strict";
import test from "node:test";
import {
  artWeight,
  BASE_ART_WEIGHT,
  burnPayout,
  claimFailureMessage,
  dailyPayout,
  decideClaim,
  formatRemaining,
  issuePrint,
  pickWeighted,
  positionFromEmoji,
  RARE_ALT_WEIGHT,
  rollArts,
  rollQuality,
  SECRET_RARE_ALT_WEIGHT,
} from "./balance.js";

const catalog = [
  { id: "denji-base", rarity: "Common" },
  { id: "denji-transformed", rarity: "Rare" },
  { id: "makima-base", rarity: "Common" },
  { id: "kobenis-car-base", rarity: "Rare" },
  { id: "kobenis-car-wreck", rarity: "Secret Rare" },
];

test("base images share one weight, including a base labeled Rare", () => {
  assert.equal(artWeight("denji-base", "Common"), BASE_ART_WEIGHT);
  assert.equal(artWeight("makima-base", "Common"), BASE_ART_WEIGHT);
  assert.equal(artWeight("kobenis-car-base", "Rare"), BASE_ART_WEIGHT);
  assert.equal(artWeight("denji-transformed", "Rare"), RARE_ALT_WEIGHT);
  assert.equal(artWeight("kobenis-car-wreck", "Secret Rare"), SECRET_RARE_ALT_WEIGHT);
  assert.equal(artWeight("ni-no-kuni-drippy-base", "Secret Rare"), SECRET_RARE_ALT_WEIGHT);
});

test("weighted pick walks the table in order", () => {
  const items = catalog.map((variant) => ({ ...variant, weight: artWeight(variant.id, variant.rarity) }));
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  assert.equal(pickWeighted(items, () => 0).id, "denji-base");
  const justPastFirstBase = BASE_ART_WEIGHT / total;
  assert.equal(pickWeighted(items, () => justPastFirstBase).id, "denji-transformed");
  assert.equal(pickWeighted(items, () => 0.999999).id, "kobenis-car-wreck");
});

test("quality roll uses the fixed odds", () => {
  const table = [
    { quality: "COMMON", weight: 60 },
    { quality: "UNCOMMON", weight: 25 },
    { quality: "RARE", weight: 10 },
    { quality: "EPIC", weight: 4 },
    { quality: "LEGENDARY", weight: 1 },
  ];
  const total = 100;
  assert.equal(rollQuality(() => 0), "COMMON");
  assert.equal(rollQuality(() => 60 / total), "UNCOMMON");
  assert.equal(rollQuality(() => 85 / total), "RARE");
  assert.equal(rollQuality(() => 95 / total), "EPIC");
  assert.equal(rollQuality(() => 99 / total), "LEGENDARY");
  assert.equal(table[0]?.weight, 60);
});

test("three slots can repeat the same art", () => {
  const only = [{ id: "denji-base", rarity: "Common" }];
  const rolled = rollArts(only, () => 0, 3);
  assert.deepEqual(rolled.map((row) => row.id), ["denji-base", "denji-base", "denji-base"]);
});

test("burn payouts follow quality", () => {
  assert.equal(burnPayout("COMMON"), 20);
  assert.equal(burnPayout("UNCOMMON"), 50);
  assert.equal(burnPayout("RARE"), 100);
  assert.equal(burnPayout("EPIC"), 200);
  assert.equal(burnPayout("LEGENDARY"), 500);
  assert.equal(burnPayout("nope"), 20);
});

test("daily payout adds the prestige bonus", () => {
  assert.equal(dailyPayout(0), 100);
  assert.equal(dailyPayout(25), 125);
  assert.equal(dailyPayout(-5), 100);
});

test("print numbers count up from the stored next value", () => {
  assert.deepEqual(issuePrint(1), { printNumber: 1, nextPrint: 2 });
  assert.deepEqual(issuePrint(2), { printNumber: 2, nextPrint: 3 });
  assert.throws(() => issuePrint(0));
});

test("claim rules prefer expiry, then cooldown, then a taken slot", () => {
  const open = {
    now: 100,
    expiresAt: 500,
    dropCreatedAt: 0,
    slotClaimed: false,
    claimerIsDropper: false,
    claimedByDropper: false,
    grabReadyAt: null as number | null,
  };
  assert.deepEqual(
    decideClaim({ ...open, now: 1_000, expiresAt: 500 }),
    { ok: false, reason: "expired" },
  );
  assert.deepEqual(
    decideClaim({ ...open, slotClaimed: true }),
    { ok: false, reason: "taken" },
  );
  assert.deepEqual(
    decideClaim({ ...open, grabReadyAt: 250 }),
    { ok: false, reason: "cooldown" },
  );
  assert.deepEqual(
    decideClaim({ ...open, grabReadyAt: 50 }),
    { ok: true, foughtOff: false },
  );
  assert.deepEqual(decideClaim(open), { ok: true, foughtOff: false });
  assert.deepEqual(
    decideClaim({ ...open, slotClaimed: true, claimerIsDropper: true }),
    { ok: true, foughtOff: true },
  );
  assert.deepEqual(
    decideClaim({ ...open, slotClaimed: true, claimerIsDropper: true, claimedByDropper: true }),
    { ok: false, reason: "taken" },
  );
  assert.deepEqual(
    decideClaim({ ...open, now: 21_000, expiresAt: 120_000, slotClaimed: true, claimerIsDropper: true }),
    { ok: false, reason: "taken" },
  );
  assert.deepEqual(
    decideClaim({ ...open, slotClaimed: true, claimerIsDropper: true, grabReadyAt: 250 }),
    { ok: false, reason: "cooldown" },
  );
  assert.match(claimFailureMessage("cooldown", 90_000), /1m 30s/);
  assert.equal(formatRemaining(0), "ready");
  assert.equal(formatRemaining(10 * 60 * 60 * 1000), "10 hours");
  assert.equal(formatRemaining((23 * 60 + 41) * 60 * 1000), "23 hours 41 minutes");
  assert.equal(formatRemaining(60 * 60 * 1000 + 60 * 1000), "1 hour 1 minute");
});

test("number emoji map to drop slots", () => {
  assert.equal(positionFromEmoji("1️⃣"), 1);
  assert.equal(positionFromEmoji("2️⃣"), 2);
  assert.equal(positionFromEmoji("3️⃣"), 3);
  assert.equal(positionFromEmoji("ak_slot_2"), 2);
  assert.equal(positionFromEmoji("ak_slot_4"), 4);
  assert.equal(positionFromEmoji("4️⃣"), 4);
  assert.equal(positionFromEmoji("👍"), null);
  assert.equal(positionFromEmoji(null), null);
});
