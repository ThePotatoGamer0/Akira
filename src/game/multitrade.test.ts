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
