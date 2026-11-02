import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "../generated/prisma/client.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "akira-pool-"));
const dbFile = path.join(dir, "test.db");

let prisma: PrismaClient;
let live: typeof import("./live-buffs.js");
let drops: typeof import("./drops.js");

const morning = new Date("2026-11-02T00:00:30.000Z");
const yesterday = new Date("2026-11-01T02:30:00.000Z");

before(async () => {
  process.env["DATABASE_URL"] = `file:${dbFile}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], { cwd: root, env: process.env, stdio: "pipe" });
  const db = await import("../db/client.js");
  live = await import("./live-buffs.js");
  drops = await import("./drops.js");
  prisma = db.prisma;
});

after(async () => {
  await prisma.$disconnect();
  fs.rmSync(dir, { recursive: true, force: true });
});

let guilds = 0;
async function pool(totalBits: number, extra: { lastReset?: Date; activeBuff?: string; buffExpiry?: Date } = {}) {
  guilds += 1;
  const guildId = `guild-${guilds}`;
  await prisma.serverPool.create({
    data: {
      guildId,
      totalBits,
      lastReset: extra.lastReset ?? yesterday,
      activeBuff: extra.activeBuff ?? null,
      buffExpiry: extra.buffExpiry ?? null,
      buffTier: extra.activeBuff ? 4 : 0,
    },
  });
  return guildId;
}

test("a pot under 500 stays and grants nothing", async () => {
  const guildId = await pool(480);
  const result = await live.rollServerPool(guildId, morning, () => 0.5);
  assert.equal(result?.spent, false);
  const row = await prisma.serverPool.findUniqueOrThrow({ where: { guildId } });
  assert.equal(row.totalBits, 480);
  assert.equal(row.carriedBits, 0);
  assert.equal(row.activeBuff, null);
});

test("a pot between goals spends nothing and keeps every bit", async () => {
  const guildId = await pool(7_000);
  const result = await live.rollServerPool(guildId, morning, () => 0.5);
  assert.equal(result?.spent, false);
  assert.equal(result?.goal, 0);
  assert.equal(result?.carried, 0);
  const row = await prisma.serverPool.findUniqueOrThrow({ where: { guildId } });
  assert.equal(row.totalBits, 7_000);
});

test("10,400 spends the 10k goal, adds the tracked pull, and carries 400", async () => {
  const guildId = await pool(10_400);
  const result = await live.rollServerPool(guildId, morning, () => 0.5);
  assert.equal(result?.goal, 10_000);
  assert.equal(result?.carried, 400);
  assert.ok(result?.buffs.includes("tracked_pull"));
  const row = await prisma.serverPool.findUniqueOrThrow({ where: { guildId } });
  assert.equal(row.totalBits, 400);
  assert.equal(row.carriedBits, 400);
  assert.ok(row.activeBuff?.split(",").includes("tracked_pull"));
});

test("25,000 guarantees the poll winner and rolls the other slot", async () => {
  const guildId = await pool(31_250);
  const result = await live.rollServerPool(guildId, morning, () => 0.1, { winners: ["four_cards"] });
  assert.equal(result?.goal, 25_000);
  assert.equal(result?.carried, 6_250);
  assert.equal(result?.buffs.length, 3);
  assert.ok(result?.buffs.includes("four_cards"));
  assert.ok(result?.buffs.includes("tracked_pull"));
  assert.equal(new Set(result?.buffs).size, result?.buffs.length);
  const row = await prisma.serverPool.findUniqueOrThrow({ where: { guildId } });
  assert.equal(row.totalBits, 6_250);
});

test("50,000 takes both poll winners with no random slot", async () => {
  const guildId = await pool(70_000);
  const result = await live.rollServerPool(guildId, morning, () => 0.3, { winners: ["shiny_luck", "drop_cooldown"] });
  assert.deepEqual(result?.buffs, ["shiny_luck", "drop_cooldown", "tracked_pull"]);
  assert.equal(result?.carried, 20_000);
});

test("a pot that already rolled today is left alone", async () => {
  const guildId = await pool(12_000, { lastReset: new Date("2026-11-02T00:00:01.000Z") });
  assert.equal(await live.rollServerPool(guildId, morning, () => 0.5), null);
});

test("a tracked pull reads only the dropper's own tracked series", async () => {
  const guildId = await pool(0, {
    lastReset: morning,
    activeBuff: "four_cards,tracked_pull",
    buffExpiry: new Date("2026-11-03T00:00:00.000Z"),
  });
  const series = await prisma.series.create({ data: { name: "Servamp", slug: "servamp" } });
  const other = await prisma.series.create({ data: { name: "Berserk", slug: "berserk" } });
  const one = await prisma.user.create({ data: { discordId: "one", discordUsername: "one" } });
  const two = await prisma.user.create({ data: { discordId: "two", discordUsername: "two" } });
  await prisma.trackedSeries.create({ data: { userId: one.id, seriesId: series.id, position: 0 } });
  await prisma.trackedSeries.create({ data: { userId: two.id, seriesId: other.id, position: 0 } });

  const first = await live.activeEffects(one.id, guildId, morning);
  assert.deepEqual(first.trackedSeriesIds, [series.id]);
  const second = await live.activeEffects(two.id, guildId, morning);
  assert.deepEqual(second.trackedSeriesIds, [other.id]);
  assert.equal(first.cardCount, 4);
});

test("without the pull nobody's tracked series changes a drop", async () => {
  const guildId = await pool(0, {
    lastReset: morning,
    activeBuff: "four_cards",
    buffExpiry: new Date("2026-11-03T00:00:00.000Z"),
  });
  const series = await prisma.series.findFirstOrThrow({ where: { slug: "servamp" } });
  const user = await prisma.user.create({ data: { discordId: "three", discordUsername: "three" } });
  await prisma.trackedSeries.create({ data: { userId: user.id, seriesId: series.id, position: 0 } });
  const effects = await live.activeEffects(user.id, guildId, morning);
  assert.deepEqual(effects.trackedSeriesIds, []);
});

test("the pool channel is saved and can be cleared", async () => {
  const guildId = "guild-channel";
  await drops.setPoolChannel(guildId, "123");
  assert.equal(await drops.resolvePoolChannelId(guildId), "123");
  await drops.setPoolChannel(guildId, null);
  assert.equal(await drops.resolvePoolChannelId(guildId), null);
  // Keeping the drop channel does not mean keeping a pool channel.
  await drops.setDropChannel(guildId, "456");
  assert.equal(await drops.resolveDropChannelId(guildId), "456");
  assert.equal(await drops.resolvePoolChannelId(guildId), null);
});

test("a pot reset after a missed midnight carries", async () => {
  const guildId = await pool(12_500, { lastReset: new Date("2026-10-30T02:00:00.000Z") });
  const results = await live.rollDuePools(morning, () => 0.5, new Set([guildId]));
  assert.equal(results.length, 1);
  assert.equal(results[0]?.goal, 10_000);
  assert.equal(results[0]?.carried, 2_500);
});

test("a guild outside the host set is not rolled", async () => {
  const guildId = await pool(15_000);
  const results = await live.rollDuePools(morning, () => 0.5, new Set(["someone-else"]));
  assert.equal(results.length, 0);
  const row = await prisma.serverPool.findUniqueOrThrow({ where: { guildId } });
  assert.equal(row.totalBits, 15_000);
});
