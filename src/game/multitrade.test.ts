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
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "akira-mtrade-"));
const dbFile = path.join(dir, "test.db");

let prisma: PrismaClient;
let proposeMultitrade: typeof import("./multitrade.js").proposeMultitrade;
let agreeMultitrade: typeof import("./multitrade.js").agreeMultitrade;
let addToMultitrade: typeof import("./multitrade.js").addToMultitrade;
let lockMultitrade: typeof import("./multitrade.js").lockMultitrade;
let cancelMultitrade: typeof import("./multitrade.js").cancelMultitrade;

before(async () => {
  process.env["DATABASE_URL"] = `file:${dbFile}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: root,
    env: process.env,
    stdio: "pipe",
  });
  const db = await import("../db/client.js");
  const multitrade = await import("./multitrade.js");
  prisma = db.prisma;
  proposeMultitrade = multitrade.proposeMultitrade;
  agreeMultitrade = multitrade.agreeMultitrade;
  addToMultitrade = multitrade.addToMultitrade;
  lockMultitrade = multitrade.lockMultitrade;
  cancelMultitrade = multitrade.cancelMultitrade;

  const series = await prisma.series.create({ data: { name: "Servamp", slug: "servamp" } });
  const character = await prisma.character.create({
    data: { name: "Tetsu Sendagaya", slug: "tetsu", seriesId: series.id },
  });
  await prisma.cardVariant.create({
    data: { id: "tetsu-base", name: "Base", rarity: "Common", image: "base.png", characterId: character.id },
  });
});

after(async () => {
  await prisma.$disconnect();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function own(discordId: string, cardId: string, bits: number, tag: string | null = null) {
  const user = await prisma.user.upsert({
    where: { discordId },
    create: { discordId, discordUsername: discordId, bits },
    update: { bits },
  });
  await prisma.card.upsert({
    where: { id: cardId },
    create: { id: cardId, variantId: "tetsu-base", printNumber: 1, quality: "COMMON", ownerId: user.id, tag },
    update: { ownerId: user.id, tag },
  });
  return user;
}

test("both locks move cards and bits, and a new offer clears the locks", async () => {
  await own("alice", "alice01", 100, "fav");
  await own("bob", "bob0001", 40);
  const opened = await proposeMultitrade({
    fromDiscordId: "alice",
    fromUsername: "alice",
    toDiscordId: "bob",
    toUsername: "bob",
    guildId: "guild",
    channelId: "channel",
  });
  assert.equal(opened.status, "request");
  const agreed = await agreeMultitrade(opened.id, "bob");
  assert.equal(agreed.status, "open");
  await addToMultitrade("alice", "channel", { cards: ["alice01"], bits: 25, unknown: [] });
  await addToMultitrade("bob", "channel", { cards: ["bob0001"], bits: 10, unknown: [] });
  const locked = await lockMultitrade(opened.id, "alice");
  assert.equal(locked.from.locked, true);
  assert.equal(locked.to.locked, false);
  const added = await addToMultitrade("alice", "channel", { cards: [], bits: 5, unknown: [] });
  assert.equal(added?.view.from.locked, false);
  assert.equal(added?.view.from.bits, 30);
  await lockMultitrade(opened.id, "alice");
  const done = await lockMultitrade(opened.id, "bob");
  assert.equal(done.status, "done");
  assert.equal(done.from.cards[0]?.characterName, "Tetsu Sendagaya");

  const alice = await prisma.user.findUnique({ where: { discordId: "alice" } });
  const bob = await prisma.user.findUnique({ where: { discordId: "bob" } });
  assert.equal(alice?.bits, 80);
  assert.equal(bob?.bits, 60);
  assert.equal((await prisma.card.findUnique({ where: { id: "alice01" } }))?.ownerId, bob?.id);
  assert.equal((await prisma.card.findUnique({ where: { id: "alice01" } }))?.tag, null);
  assert.equal((await prisma.card.findUnique({ where: { id: "bob0001" } }))?.ownerId, alice?.id);
});

test("a card you do not own is refused, and cancel closes the trade", async () => {
  await own("cara", "cara001", 10);
  await own("dan", "dan0001", 10);
  const opened = await proposeMultitrade({
    fromDiscordId: "cara",
    fromUsername: "cara",
    toDiscordId: "dan",
    toUsername: "dan",
    guildId: "guild",
    channelId: "other",
  });
  await agreeMultitrade(opened.id, "dan");
  await assert.rejects(
    () => addToMultitrade("cara", "other", { cards: ["dan0001"], bits: 0, unknown: [] }),
    (err: unknown) => err instanceof GameError && err.code === "not-owner",
  );
  await assert.rejects(
    () => addToMultitrade("cara", "other", { cards: [], bits: 50, unknown: [] }),
    (err: unknown) => err instanceof GameError && err.code === "bits",
  );
  const cancelled = await cancelMultitrade(opened.id, "cara");
  assert.equal(cancelled.status, "cancelled");
  assert.equal((await prisma.card.findUnique({ where: { id: "dan0001" } }))?.ownerId, (await prisma.user.findUnique({ where: { discordId: "dan" } }))?.id);
});

async function opened(from: string, to: string, channel: string) {
  const trade = await proposeMultitrade({
    fromDiscordId: from,
    fromUsername: from,
    toDiscordId: to,
    toUsername: to,
    guildId: "guild",
    channelId: channel,
  });
  return agreeMultitrade(trade.id, to);
}

test("a gift is never refused for its size, and bits stay uncapped while the other side is empty", async () => {
  await own("giver", "gift0001", 5_000);
  await own("taker", "gift0002", 0);
  const trade = await opened("giver", "taker", "gifts");
  const big = await addToMultitrade("giver", "gifts", { cards: [], bits: 3_000, unknown: [] });
  assert.equal(big?.view.from.bits, 3_000);
  assert.equal(big?.view.fairness.level, "fair");
  const locked = await lockMultitrade(trade.id, "giver");
  assert.equal(locked.status, "open");
  const done = await lockMultitrade(trade.id, "taker");
  assert.equal(done.status, "done");
  const taker = await prisma.user.findUnique({ where: { discordId: "taker" } });
  assert.equal(taker?.bits, 3_000);
});

test("bits are capped once both sides have something on them", async () => {
  await own("capped", "capdd001", 5_000);
  await own("capper", "cappe001", 10);
  await opened("capped", "capper", "caps");
  await addToMultitrade("capper", "caps", { cards: ["cappe001"], bits: 0, unknown: [] });
  const tooMany = await addToMultitrade("capped", "caps", { cards: [], bits: 2_100, unknown: [] }).then(
    () => null,
    (err: unknown) => err,
  );
  assert.ok(tooMany instanceof GameError);
  assert.equal((tooMany as GameError).code, "bits-cap");
  const ok = await addToMultitrade("capped", "caps", { cards: [], bits: 1_500, unknown: [] });
  assert.equal(ok?.view.from.bits, 1_500);
});

test("a lopsided trade cancels at lock, and an admin force lets it through", async () => {
  await own("hoarder", "hoard001", 0);
  await own("casual", "casua001", 0);
  const character = await prisma.character.findFirst({ where: { slug: "tetsu" } });
  assert.ok(character);
  await prisma.cardVariant.create({
    data: { id: "tetsu-alt", name: "Alt", rarity: "Legendary", image: "alt.png", characterId: character.id },
  });
  // Six legendaries against one common is far past 5x and past the block floor.
  for (let index = 1; index <= 6; index += 1) {
    await prisma.card.create({
      data: { id: `legend${index}`, variantId: "tetsu-alt", printNumber: index, quality: "LEGENDARY", ownerId: (await prisma.user.findUnique({ where: { discordId: "hoarder" } }))!.id },
    });
  }
  await prisma.card.create({
    data: { id: "casualc1", variantId: "tetsu-base", printNumber: 1, quality: "COMMON", ownerId: (await prisma.user.findUnique({ where: { discordId: "casual" } }))!.id },
  });
  const trade = await opened("hoarder", "casual", "lopsided");
  await addToMultitrade("hoarder", "lopsided", { cards: ["legend1", "legend2", "legend3", "legend4", "legend5", "legend6"], bits: 0, unknown: [] });
  const offered = await addToMultitrade("casual", "lopsided", { cards: ["casualc1"], bits: 0, unknown: [] });
  assert.equal(offered?.view.fairness.level, "block");
  const blocked = await lockMultitrade(trade.id, "hoarder");
  assert.equal(blocked.status, "cancelled");
  assert.match(blocked.closeReason ?? "", /lopsided/);
});
