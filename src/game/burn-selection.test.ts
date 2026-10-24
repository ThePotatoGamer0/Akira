import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "../generated/prisma/client.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "akira-burn-sel-"));
const dbFile = path.join(dir, "test.db");

let prisma: PrismaClient;
let quoteOwnedBurn: typeof import("./economy.js").quoteOwnedBurn;
let burnOwnedCards: typeof import("./economy.js").burnOwnedCards;

before(async () => {
  process.env["DATABASE_URL"] = `file:${dbFile}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: root,
    env: process.env,
    stdio: "pipe",
  });
  const db = await import("../db/client.js");
  const economy = await import("./economy.js");
  prisma = db.prisma;
  quoteOwnedBurn = economy.quoteOwnedBurn;
  burnOwnedCards = economy.burnOwnedCards;

  const series = await prisma.series.create({ data: { name: "Haikyuu", slug: "haikyuu" } });
  const kenma = await prisma.character.create({ data: { name: "Kenma Kozume", slug: "kenma", seriesId: series.id } });
  await prisma.cardVariant.create({ data: { id: "kenma-base", name: "Base", rarity: "Common", image: "base.png", characterId: kenma.id } });
  const owner = await prisma.user.create({
    data: { discordId: "owner", discordUsername: "owner", bits: 10, lastGrabbedCardId: "common1" },
  });
  const other = await prisma.user.create({ data: { discordId: "other", discordUsername: "other" } });
  await prisma.card.create({ data: { id: "common1", variantId: "kenma-base", printNumber: 1, quality: "COMMON", ownerId: owner.id } });
  await prisma.card.create({ data: { id: "common2", variantId: "kenma-base", printNumber: 2, quality: "COMMON", ownerId: owner.id } });
  await prisma.card.create({ data: { id: "rare001", variantId: "kenma-base", printNumber: 3, quality: "RARE", ownerId: owner.id } });
  await prisma.card.create({ data: { id: "held001", variantId: "kenma-base", printNumber: 4, quality: "EPIC", ownerId: owner.id } });
  await prisma.transferOffer.create({
    data: { id: "offer1", kind: "give", fromUserId: owner.id, toUserId: other.id, fromCardId: "held001", status: "pending" },
  });
  await prisma.buff.create({
    data: { userId: owner.id, kind: "burn_value", expiresAt: new Date(Date.now() + 60_000) },
  });
});

after(async () => {
  await prisma.$disconnect();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("one card pays the boosted burn rate", async () => {
  const quote = await quoteOwnedBurn("owner", "owner", ["common1"], null);
  assert.equal(quote.awarded, 40);
  assert.equal(quote.boosted, true);
  const result = await burnOwnedCards("owner", "owner", ["common1"], null);
  assert.equal(result.awarded, 40);
  assert.equal(result.balance, 50);
  const user = await prisma.user.findUnique({ where: { discordId: "owner" } });
  assert.equal(user?.lastGrabbedCardId, null);
  assert.equal(await prisma.card.findUnique({ where: { id: "common1" } }), null);
});

test("a batch pays the boosted rate and leaves a card that is in a trade", async () => {
  const quote = await quoteOwnedBurn("owner", "owner", ["common2", "rare001", "held001"], null);
  assert.equal(quote.awarded, 240);
  assert.equal(quote.skipped, 1);
  assert.equal(quote.boosted, true);
  const result = await burnOwnedCards("owner", "owner", ["common2", "rare001", "held001"], null);
  assert.deepEqual(result.burning.sort(), ["common2", "rare001"]);
  assert.equal(result.awarded, 240);
  assert.equal(result.balance, 290);
  assert.equal(await prisma.card.findUnique({ where: { id: "held001" } }) !== null, true);
});

test("someone else's card is refused", async () => {
  await assert.rejects(() => quoteOwnedBurn("other", "other", ["held001"], null), /belong to you/);
});
