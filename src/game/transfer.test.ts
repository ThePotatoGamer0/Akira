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
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "akira-transfer-"));
const dbFile = path.join(dir, "test.db");

let prisma: PrismaClient;
let proposeGive: typeof import("./transfer.js").proposeGive;
let proposeTrade: typeof import("./transfer.js").proposeTrade;
let acceptTransfer: typeof import("./transfer.js").acceptTransfer;
let cancelTransfer: typeof import("./transfer.js").cancelTransfer;
let burnOwnedCard: typeof import("./economy.js").burnOwnedCard;

before(async () => {
  process.env["DATABASE_URL"] = `file:${dbFile}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: root,
    env: process.env,
    stdio: "pipe",
  });
  const db = await import("../db/client.js");
  const transfer = await import("./transfer.js");
  const economy = await import("./economy.js");
  prisma = db.prisma;
  proposeGive = transfer.proposeGive;
  proposeTrade = transfer.proposeTrade;
  acceptTransfer = transfer.acceptTransfer;
  cancelTransfer = transfer.cancelTransfer;
  burnOwnedCard = economy.burnOwnedCard;

  const series = await prisma.series.create({ data: { name: "Servamp", slug: "servamp" } });
  const character = await prisma.character.create({
    data: { name: "Tetsu Sendagaya", slug: "tetsu", seriesId: series.id },
  });
  await prisma.cardVariant.create({
    data: {
      id: "tetsu-base",
      name: "Base",
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

async function own(discordId: string, cardId: string) {
  const user = await prisma.user.upsert({
    where: { discordId },
    create: { discordId, discordUsername: discordId },
    update: {},
  });
  await prisma.card.upsert({
    where: { id: cardId },
    create: {
      id: cardId,
      variantId: "tetsu-base",
      printNumber: 1,
      quality: "COMMON",
      ownerId: user.id,
    },
    update: { ownerId: user.id },
  });
  return user;
}

test("a give moves the card only after both players accept", async () => {
  await own("giver", "giveaaa");
  await own("getter", "unused1");
  const offer = await proposeGive({
    fromDiscordId: "giver",
    fromUsername: "giver",
    toDiscordId: "getter",
    toUsername: "getter",
    cardId: "giveaaa",
  });
  const waiting = await acceptTransfer(offer.id, "getter");
  assert.equal(waiting.status, "pending");
  assert.equal((await prisma.card.findUnique({ where: { id: "giveaaa" } }))?.ownerId, (await prisma.user.findUnique({ where: { discordId: "giver" } }))?.id);
  await prisma.card.update({ where: { id: "giveaaa" }, data: { obtainedAt: new Date("2020-01-01T00:00:00Z") } });
  const done = await acceptTransfer(offer.id, "giver");
  assert.equal(done.status, "done");
  const card = await prisma.card.findUnique({ where: { id: "giveaaa" }, include: { owner: true } });
  assert.equal(card?.owner?.discordId, "getter");
  assert.ok(card && card.obtainedAt.getTime() > new Date("2020-01-01T00:00:00Z").getTime());
});

test("a trade swaps the two cards only after both players accept", async () => {
  await own("left", "tradeaa");
  await own("right", "tradebb");
  const offer = await proposeTrade({
    fromDiscordId: "left",
    fromUsername: "left",
    cardId: "tradeaa",
    theirCardId: "tradebb",
  });
  await acceptTransfer(offer.id, "left");
  const done = await acceptTransfer(offer.id, "right");
  assert.equal(done.status, "done");
  const first = await prisma.card.findUnique({ where: { id: "tradeaa" }, include: { owner: true } });
  const second = await prisma.card.findUnique({ where: { id: "tradebb" }, include: { owner: true } });
  assert.equal(first?.owner?.discordId, "right");
  assert.equal(second?.owner?.discordId, "left");
});

test("cancelling a give leaves the card where it was", async () => {
  await own("owner", "keepaaa");
  await own("other", "unused2");
  const offer = await proposeGive({
    fromDiscordId: "owner",
    fromUsername: "owner",
    toDiscordId: "other",
    toUsername: "other",
    cardId: "keepaaa",
  });
  const cancelled = await cancelTransfer(offer.id, "other");
  assert.equal(cancelled.status, "cancelled");
  const card = await prisma.card.findUnique({ where: { id: "keepaaa" }, include: { owner: true } });
  assert.equal(card?.owner?.discordId, "owner");
});

test("you cannot give a card you do not own, and an open offer locks the card", async () => {
  await own("holder", "lockaaa");
  await own("friend", "unused3");
  await assert.rejects(
    () => proposeGive({
      fromDiscordId: "friend",
      fromUsername: "friend",
      toDiscordId: "holder",
      toUsername: "holder",
      cardId: "lockaaa",
    }),
    (err: unknown) => err instanceof GameError && err.code === "not-owner",
  );
  await proposeGive({
    fromDiscordId: "holder",
    fromUsername: "holder",
    toDiscordId: "friend",
    toUsername: "friend",
    cardId: "lockaaa",
  });
  await assert.rejects(
    () => burnOwnedCard("holder", "holder", "lockaaa", null),
    (err: unknown) => err instanceof GameError && err.code === "busy",
  );
  await assert.rejects(
    () => proposeGive({
      fromDiscordId: "holder",
      fromUsername: "holder",
      toDiscordId: "friend",
      toUsername: "friend",
      cardId: "lockaaa",
    }),
    (err: unknown) => err instanceof GameError && err.code === "busy",
  );
});

test("an outsider cannot accept, and their card has to be theirs", async () => {
  await own("seller", "theiraa");
  await own("buyer", "mineaaa");
  const offer = await proposeGive({
    fromDiscordId: "seller",
    fromUsername: "seller",
    toDiscordId: "buyer",
    toUsername: "buyer",
    cardId: "theiraa",
  });
  await assert.rejects(
    () => acceptTransfer(offer.id, "stranger"),
    (err: unknown) => err instanceof GameError && err.code === "outsider",
  );
  await assert.rejects(
    () => proposeTrade({
      fromDiscordId: "seller",
      fromUsername: "seller",
      cardId: "theiraa",
      theirCardId: "theiraa",
    }),
    (err: unknown) => err instanceof GameError && /isn't theirs|different/.test((err as GameError).message),
  );
});

test("getting a watched character in a give takes it off the wishlist", async () => {
  const getter = await own("getter2", "unusedw1");
  await own("giver2", "givew01");
  const character = await prisma.character.findFirst({ where: { slug: "tetsu" } });
  assert.ok(character);
  await prisma.wishlist.create({ data: { userId: getter.id, characterId: character.id } });
  const offer = await proposeGive({
    fromDiscordId: "giver2",
    fromUsername: "giver2",
    toDiscordId: "getter2",
    toUsername: "getter2",
    cardId: "givew01",
  });
  await acceptTransfer(offer.id, "getter2");
  const done = await acceptTransfer(offer.id, "giver2");
  assert.equal(done.status, "done");
  assert.deepEqual(done.wishlistCleared, [character.name]);
  const left = await prisma.wishlist.findUnique({
    where: { userId_characterId: { userId: getter.id, characterId: character.id } },
  });
  assert.equal(left, null);
});

test("a trade finds the other player from the cards and swaps the order if needed", async () => {
  await own("left", "swapaa1");
  await own("right", "swapbb1");
  const swapped = await proposeTrade({
    fromDiscordId: "left",
    fromUsername: "left",
    cardId: "swapbb1",
    theirCardId: "swapaa1",
  });
  assert.equal(swapped.fromDiscordId, "left");
  assert.equal(swapped.toDiscordId, "right");
  assert.equal(swapped.fromCard?.id, "swapaa1");
  assert.equal(swapped.toCard?.id, "swapbb1");
  await cancelTransfer(swapped.id, "left");

  await own("left", "minecc1");
  await own("right", "theird1");
  await own("other", "otherc1");
  await assert.rejects(
    () => proposeTrade({
      fromDiscordId: "left",
      fromUsername: "left",
      cardId: "theird1",
      theirCardId: "otherc1",
    }),
    (err: unknown) => err instanceof GameError && err.code === "not-owner",
  );
  await assert.rejects(
    () => proposeTrade({
      fromDiscordId: "left",
      fromUsername: "left",
      cardId: "swapaa1",
      theirCardId: "minecc1",
    }),
    (err: unknown) => err instanceof GameError && err.code === "self",
  );
});
