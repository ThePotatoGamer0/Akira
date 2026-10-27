import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "../generated/prisma/client.js";
import { GRAB_BITS } from "./balance.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "akira-game-"));
const dbFile = path.join(dir, "test.db");

let prisma: PrismaClient;
let claimReaction: typeof import("./drops.js").claimReaction;
let releaseHeldGrabs: typeof import("./drops.js").releaseHeldGrabs;

before(async () => {
  process.env["DATABASE_URL"] = `file:${dbFile}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: root,
    env: process.env,
    stdio: "pipe",
  });
  const db = await import("../db/client.js");
  const drops = await import("./drops.js");
  prisma = db.prisma;
  claimReaction = drops.claimReaction;
  releaseHeldGrabs = drops.releaseHeldGrabs;

  const series = await prisma.series.create({
    data: { name: "Chainsaw Man", slug: "chainsaw-man" },
  });
  const character = await prisma.character.create({
    data: { name: "Denji", slug: "denji", seriesId: series.id },
  });
  await prisma.cardVariant.create({
    data: {
      id: "denji-base",
      name: "Public Safety Rookie",
      rarity: "Common",
      image: "base.png",
      characterId: character.id,
    },
  });
});

after(async () => {
  await prisma.$disconnect();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function makeDrop(messageId: string, expiresAt: Date, positions = [1], dropperDiscordId?: string) {
  let dropperId: string | undefined;
  if (dropperDiscordId) {
    const dropper = await prisma.user.upsert({
      where: { discordId: dropperDiscordId },
      create: { discordId: dropperDiscordId, discordUsername: dropperDiscordId },
      update: {},
    });
    dropperId = dropper.id;
  }
  return prisma.drop.create({
    data: {
      guildId: "guild",
      channelId: "channel",
      messageId,
      expiresAt,
      ...(dropperId ? { dropperId } : {}),
      slots: {
        create: positions.map((position) => ({
          position,
          variantId: "denji-base",
          quality: "COMMON",
          frameId: 0,
        })),
      },
    },
  });
}

describe("saved drops", { concurrency: false }, () => {
test("two grabs of one slot cannot both win", async () => {
  await makeDrop("race", new Date(Date.now() + 60_000));
  const results = await Promise.allSettled([
    claimReaction({ messageId: "race", position: 1, discordId: "alice", username: "alice" }),
    claimReaction({ messageId: "race", position: 1, discordId: "bob", username: "bob" }),
  ]);
  const won = results.filter((result) => result.status === "fulfilled");
  const lost = results.filter((result) => result.status === "rejected");
  assert.equal(won.length, 1);
  assert.equal(lost.length, 1);
  const cards = await prisma.card.count();
  assert.equal(cards, 1);
  const card = await prisma.card.findFirst();
  assert.equal(card?.printNumber, 1);
  assert.match(card?.id ?? "", /^[0-9a-z]{7}$/);
});

test("an expired drop cannot be grabbed", async () => {
  await makeDrop("expired", new Date(Date.now() - 1_000));
  await assert.rejects(
    () => claimReaction({ messageId: "expired", position: 1, discordId: "cara", username: "cara" }),
    /can no longer be grabbed/,
  );
});

test("grab cooldown blocks a second card", async () => {
  const user = await prisma.user.upsert({
    where: { discordId: "dara" },
    create: { discordId: "dara", discordUsername: "dara" },
    update: {},
  });
  await prisma.cooldown.upsert({
    where: { userId_type: { userId: user.id, type: "GRAB" } },
    create: { userId: user.id, type: "GRAB", expiresAt: new Date(Date.now() + 60_000) },
    update: { expiresAt: new Date(Date.now() + 60_000) },
  });
  await makeDrop("cooling", new Date(Date.now() + 60_000));
  await assert.rejects(
    () => claimReaction({ messageId: "cooling", position: 1, discordId: "dara", username: "dara" }),
    /wait/,
  );
});

test("prints increase per variant across claims", async () => {
  await makeDrop("print-a", new Date(Date.now() + 60_000), [1]);
  await makeDrop("print-b", new Date(Date.now() + 60_000), [1]);
  const counter = await prisma.printCounter.findUnique({ where: { variantId: "denji-base" } });
  const start = counter?.nextPrint ?? 1;
  const first = await claimReaction({
    messageId: "print-a",
    position: 1,
    discordId: "erin",
    username: "erin",
  });
  const second = await claimReaction({
    messageId: "print-b",
    position: 1,
    discordId: "finn",
    username: "finn",
  });
  assert.equal(first.printNumber, start);
  assert.equal(second.printNumber, start + 1);
});

test("the dropper takes back a card grabbed in the first 20 seconds", async () => {
  await makeDrop("protect", new Date(Date.now() + 60_000), [1], "dropper");
  const sniped = await claimReaction({
    messageId: "protect",
    position: 1,
    discordId: "sniper",
    username: "sniper",
  });
  const fought = await claimReaction({
    messageId: "protect",
    position: 1,
    discordId: "dropper",
    username: "dropper",
  });
  assert.equal(fought.cardId, sniped.cardId);
  assert.equal(fought.foughtOffDiscordId, "sniper");
  assert.equal(sniped.notices.length, 0);
  assert.equal(fought.notices.length, 1);
  assert.equal(fought.notices[0]?.discordId, "dropper");
  assert.equal(fought.notices[0]?.foughtOffDiscordId, "sniper");
  const card = await prisma.card.findUnique({ where: { id: fought.cardId }, include: { owner: true } });
  assert.equal(card?.owner?.discordId, "dropper");
  const sniper = await prisma.user.findUnique({ where: { discordId: "sniper" } });
  const dropper = await prisma.user.findUnique({ where: { discordId: "dropper" } });
  assert.equal(sniper?.bits, 0);
  assert.equal(dropper?.bits, GRAB_BITS);
  const sniperGrab = await prisma.cooldown.findUnique({
    where: { userId_type: { userId: sniper!.id, type: "GRAB" } },
  });
  assert.equal(sniperGrab, null);
});

test("grab lines wait until the dropper takes a different card", async () => {
  await makeDrop("hold", new Date(Date.now() + 60_000), [1, 2, 3], "holder");
  const first = await claimReaction({ messageId: "hold", position: 1, discordId: "snipe-a", username: "snipe-a" });
  const second = await claimReaction({ messageId: "hold", position: 2, discordId: "snipe-b", username: "snipe-b" });
  assert.equal(first.notices.length, 0);
  assert.equal(second.notices.length, 0);
  const taken = await claimReaction({ messageId: "hold", position: 3, discordId: "holder", username: "holder" });
  assert.deepEqual(
    taken.notices.map((notice) => notice.discordId),
    ["snipe-a", "snipe-b", "holder"],
  );
  assert.equal(taken.notices.every((notice) => notice.foughtOffDiscordId === null), true);
});

test("snipe protection ending posts the grabs that stuck", async () => {
  await makeDrop("quiet", new Date(Date.now() + 60_000), [1], "quiet-dropper");
  const held = await claimReaction({ messageId: "quiet", position: 1, discordId: "quiet-sniper", username: "quiet-sniper" });
  assert.equal(held.notices.length, 0);
  await prisma.drop.update({
    where: { messageId: "quiet" },
    data: { createdAt: new Date(Date.now() - 21_000) },
  });
  const released = await releaseHeldGrabs();
  assert.equal(released.length, 1);
  assert.equal(released[0]?.notices[0]?.discordId, "quiet-sniper");
  assert.equal(released[0]?.notices[0]?.foughtOffDiscordId, null);
  const again = await releaseHeldGrabs();
  assert.equal(again.length, 0);
});

test("drop protection ends after 20 seconds", async () => {
  await makeDrop("late", new Date(Date.now() + 60_000), [1], "late-dropper");
  await prisma.drop.update({
    where: { messageId: "late" },
    data: { createdAt: new Date(Date.now() - 21_000) },
  });
  const late = await claimReaction({ messageId: "late", position: 1, discordId: "late-sniper", username: "late-sniper" });
  assert.equal(late.notices.length, 1);
  assert.equal(late.notices[0]?.discordId, "late-sniper");
  await assert.rejects(
    () => claimReaction({ messageId: "late", position: 1, discordId: "late-dropper", username: "late-dropper" }),
    /already took/,
  );
});

test("a grab can be remembered for a later view", async () => {
  await makeDrop("recent", new Date(Date.now() + 60_000));
  const grabbed = await claimReaction({
    messageId: "recent",
    position: 1,
    discordId: "gina",
    username: "gina",
  });
  const cards = await import("./cards.js");
  await cards.rememberGrab("gina", grabbed.cardId);
  assert.equal(await cards.lastGrabbedCard("gina"), grabbed.cardId);
  assert.equal(await cards.lastGrabbedCard("nobody"), null);
});

test("grabbing a watched character takes it off the wishlist and leaves the others alone", async () => {
  const series = await prisma.series.create({ data: { name: "Chainsaw Man Wish", slug: "csm-wish" } });
  const denji = await prisma.character.create({ data: { name: "Denji", slug: "denji-wish", seriesId: series.id } });
  const power = await prisma.character.create({ data: { name: "Power", slug: "power-wish", seriesId: series.id } });
  await prisma.cardVariant.create({
    data: {
      id: "denji-wish-base",
      name: "Public Safety Rookie",
      rarity: "Common",
      image: "base.png",
      characterId: denji.id,
    },
  });
  await prisma.drop.create({
    data: {
      guildId: "guild",
      channelId: "channel",
      messageId: "watch-grab",
      expiresAt: new Date(Date.now() + 60_000),
      slots: { create: [{ position: 1, variantId: "denji-wish-base", quality: "COMMON", frameId: 0 }] },
    },
  });
  const grabber = await prisma.user.upsert({
    where: { discordId: "wish-grabber" },
    create: { discordId: "wish-grabber", discordUsername: "wish-grabber" },
    update: {},
  });
  await prisma.wishlist.createMany({
    data: [
      { userId: grabber.id, characterId: denji.id },
      { userId: grabber.id, characterId: power.id },
    ],
  });
  const grabbed = await claimReaction({
    messageId: "watch-grab",
    position: 1,
    discordId: "wish-grabber",
    username: "wish-grabber",
  });
  assert.deepEqual(grabbed.wishlistCleared, ["Denji"]);
  const left = await prisma.wishlist.findMany({
    where: { userId: grabber.id },
    select: { character: { select: { name: true } } },
  });
  assert.deepEqual(left.map((row) => row.character.name), ["Power"]);
});

test("a wishlist heads-up skips the dropper, the grabber, and anyone the dropper already has", async () => {
  const drops = await import("./drops.js");
  const series = await prisma.series.create({ data: { name: "Heads Up", slug: "heads-up" } });
  const denji = await prisma.character.create({ data: { name: "Denji", slug: "denji-heads", seriesId: series.id } });
  const aki = await prisma.character.create({ data: { name: "Aki", slug: "aki-heads", seriesId: series.id } });
  await prisma.cardVariant.createMany({
    data: [
      { id: "denji-heads-base", name: "Denji", rarity: "Common", image: "base.png", characterId: denji.id },
      { id: "aki-heads-base", name: "Aki", rarity: "Common", image: "base.png", characterId: aki.id },
    ],
  });
  const dropper = await prisma.user.upsert({
    where: { discordId: "head-dropper" },
    create: { discordId: "head-dropper", discordUsername: "head-dropper" },
    update: {},
  });
  await prisma.card.create({
    data: { id: "headsa1", variantId: "aki-heads-base", printNumber: 1, quality: "COMMON", ownerId: dropper.id },
  });
  const grabber = await prisma.user.upsert({
    where: { discordId: "head-grabber" },
    create: { discordId: "head-grabber", discordUsername: "head-grabber" },
    update: {},
  });
  const watcher = await prisma.user.upsert({
    where: { discordId: "head-watcher" },
    create: { discordId: "head-watcher", discordUsername: "head-watcher" },
    update: {},
  });
  await prisma.wishlist.createMany({
    data: [
      { userId: watcher.id, characterId: denji.id },
      { userId: watcher.id, characterId: aki.id },
      { userId: grabber.id, characterId: denji.id },
      { userId: dropper.id, characterId: denji.id },
    ],
  });
  const drop = await prisma.drop.create({
    data: {
      guildId: "guild",
      channelId: "channel",
      messageId: "heads-up",
      expiresAt: new Date(Date.now() + 60_000),
      dropperId: dropper.id,
      slots: {
        create: [
          { position: 1, variantId: "denji-heads-base", quality: "COMMON", frameId: 0 },
          { position: 2, variantId: "aki-heads-base", quality: "COMMON", frameId: 0 },
        ],
      },
    },
  });
  await claimReaction({ messageId: "heads-up", position: 1, discordId: "head-grabber", username: "head-grabber" });
  const headsUps = await drops.wishlistHeadsUps("heads-up", "head-grabber");
  assert.deepEqual(headsUps, [{ discordId: "head-watcher", names: ["Denji"], grabbedBy: ["head-grabber"] }]);
  assert.ok(drop.id);
});
});
