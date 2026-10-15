import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "../generated/prisma/client.js";
import { GameError } from "./errors.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "akira-stats-"));
const dbFile = path.join(dir, "test.db");

let prisma: PrismaClient;
let cardCountStats: typeof import("./stats.js").cardCountStats;
let bitsStats: typeof import("./stats.js").bitsStats;
let completionStats: typeof import("./stats.js").completionStats;
let setSeriesTracked: typeof import("./stats.js").setSeriesTracked;

before(async () => {
  process.env["DATABASE_URL"] = `file:${dbFile}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: root,
    env: process.env,
    stdio: "pipe",
  });
  const db = await import("../db/client.js");
  const stats = await import("./stats.js");
  prisma = db.prisma;
  cardCountStats = stats.cardCountStats;
  bitsStats = stats.bitsStats;
  completionStats = stats.completionStats;
  setSeriesTracked = stats.setSeriesTracked;

  const hero = await prisma.series.create({ data: { name: "My Hero Academia", slug: "hero" } });
  const note = await prisma.series.create({ data: { name: "Death Note", slug: "note" } });
  await prisma.series.create({ data: { name: "Empty", slug: "empty" } });
  const extra = await prisma.series.create({ data: { name: "Extra", slug: "extra" } });
  const more = await prisma.series.create({ data: { name: "More", slug: "more" } });
  const deku = await prisma.character.create({ data: { name: "Izuku", slug: "izuku", seriesId: hero.id } });
  const ochaco = await prisma.character.create({ data: { name: "Ochaco", slug: "ochaco", seriesId: hero.id } });
  const light = await prisma.character.create({ data: { name: "Light", slug: "light", seriesId: note.id } });
  const side = await prisma.character.create({ data: { name: "Side", slug: "side", seriesId: extra.id } });
  const otherChar = await prisma.character.create({ data: { name: "Other", slug: "other", seriesId: more.id } });
  await prisma.cardVariant.create({ data: { id: "deku-base", name: "Base", rarity: "Common", image: "a.png", characterId: deku.id } });
  await prisma.cardVariant.create({ data: { id: "ochaco-base", name: "Base", rarity: "Common", image: "b.png", characterId: ochaco.id } });
  await prisma.cardVariant.create({ data: { id: "light-base", name: "Base", rarity: "Common", image: "c.png", characterId: light.id } });
  await prisma.cardVariant.create({ data: { id: "side-base", name: "Base", rarity: "Common", image: "d.png", characterId: side.id } });
  await prisma.cardVariant.create({ data: { id: "other-base", name: "Base", rarity: "Common", image: "e.png", characterId: otherChar.id } });
  const ada = await prisma.user.create({ data: { discordId: "ada", discordUsername: "ada", preferredName: "Ada", bits: 40 } });
  const bee = await prisma.user.create({ data: { discordId: "bee", discordUsername: "bee", bits: 200 } });
  await prisma.card.create({ data: { id: "c1", variantId: "deku-base", printNumber: 1, quality: "LEGENDARY", ownerId: ada.id } });
  await prisma.card.create({ data: { id: "c2", variantId: "deku-base", printNumber: 2, quality: "COMMON", ownerId: ada.id } });
  await prisma.card.create({ data: { id: "c3", variantId: "light-base", printNumber: 1, quality: "LEGENDARY", ownerId: ada.id } });
  await prisma.card.create({ data: { id: "c4", variantId: "ochaco-base", printNumber: 1, quality: "COMMON", ownerId: bee.id } });
});

after(async () => {
  await prisma.$disconnect();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("card counts follow quality and still list players with none", async () => {
  const all = await cardCountStats();
  assert.deepEqual(all.map((row) => [row.name, row.count]), [["Ada", 3], ["bee", 1]]);
  const mint = await cardCountStats("LEGENDARY");
  assert.deepEqual(mint.map((row) => [row.name, row.count]), [["Ada", 2], ["bee", 0]]);
});

test("bits order the richest player first", async () => {
  const rows = await bitsStats();
  assert.deepEqual(rows.map((row) => [row.name, row.bits]), [["bee", 200], ["Ada", 40]]);
});

test("completion uses distinct characters and tracked series replace the top four", async () => {
  const ada = await prisma.user.findUniqueOrThrow({ where: { discordId: "ada" } });
  const top = await completionStats(ada.id);
  assert.equal(top.mode, "top");
  assert.deepEqual(top.bars.map((row) => [row.name, row.owned, row.total, row.percent]), [
    ["Death Note", 1, 1, 100],
    ["My Hero Academia", 1, 2, 50],
  ]);
  assert.equal(top.series.some((row) => row.name === "Empty"), false);

  const note = top.series.find((row) => row.name === "Death Note");
  const hero = top.series.find((row) => row.name === "My Hero Academia");
  assert.ok(note && hero);
  await setSeriesTracked(ada.id, hero.seriesId, true);
  const pinned = await completionStats(ada.id);
  assert.equal(pinned.mode, "tracked");
  assert.deepEqual(pinned.bars.map((row) => row.name), ["My Hero Academia"]);
  assert.deepEqual(pinned.tracked.map((row) => row.name), ["My Hero Academia"]);
  assert.deepEqual(pinned.top.map((row) => row.name), ["Death Note", "My Hero Academia"]);

  await setSeriesTracked(ada.id, note.seriesId, true);
  const both = await completionStats(ada.id);
  assert.deepEqual(both.bars.map((row) => row.name), ["My Hero Academia", "Death Note"]);

  const extra = top.series.find((row) => row.name === "Extra");
  const more = top.series.find((row) => row.name === "More");
  assert.ok(extra && more);
  await setSeriesTracked(ada.id, extra.seriesId, true);
  await setSeriesTracked(ada.id, more.seriesId, true);
  const empty = await prisma.series.findUniqueOrThrow({ where: { slug: "empty" } });
  await assert.rejects(() => setSeriesTracked(ada.id, empty.id, true), (err: unknown) => {
    assert.ok(err instanceof GameError);
    assert.match(err.message, /four animes/);
    return true;
  });

  await setSeriesTracked(ada.id, hero.seriesId, false);
  const afterUnpin = await completionStats(ada.id);
  assert.deepEqual(afterUnpin.bars.map((row) => row.name), ["Death Note", "Extra", "More"]);
  await setSeriesTracked(ada.id, hero.seriesId, true);
  const refilled = await completionStats(ada.id);
  assert.deepEqual(refilled.bars.map((row) => row.name), ["Death Note", "Extra", "More", "My Hero Academia"]);
});
