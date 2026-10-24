import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "../generated/prisma/client.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "akira-mb-"));
const dbFile = path.join(dir, "test.db");

let prisma: PrismaClient;
let planTaggedBurn: typeof import("./multiburn.js").planTaggedBurn;
let burnTaggedCards: typeof import("./multiburn.js").burnTaggedCards;
let multiburnConfirmText: typeof import("./multiburn.js").multiburnConfirmText;

before(async () => {
  process.env["DATABASE_URL"] = `file:${dbFile}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: root,
    env: process.env,
    stdio: "pipe",
  });
  const db = await import("../db/client.js");
  const multiburn = await import("./multiburn.js");
  prisma = db.prisma;
  planTaggedBurn = multiburn.planTaggedBurn;
  burnTaggedCards = multiburn.burnTaggedCards;
  multiburnConfirmText = multiburn.multiburnConfirmText;

  const series = await prisma.series.create({ data: { name: "My Hero Academia", slug: "my-hero-academia" } });
  const deku = await prisma.character.create({ data: { name: "Izuku Midoriya", slug: "izuku", seriesId: series.id } });
  const halle = await prisma.character.create({ data: { name: "Halle Bullook", slug: "halle", seriesId: series.id } });
  await prisma.cardVariant.create({ data: { id: "izuku-base", name: "Base", rarity: "Common", image: "base.png", characterId: deku.id } });
  await prisma.cardVariant.create({ data: { id: "halle-base", name: "Base", rarity: "Common", image: "base.png", characterId: halle.id } });
  const owner = await prisma.user.create({
    data: { discordId: "owner", discordUsername: "owner", lastGrabbedCardId: "legend1" },
  });
  const other = await prisma.user.create({ data: { discordId: "other", discordUsername: "other" } });
  await prisma.tag.create({ data: { userId: owner.id, name: "fav", emoji: "⭐" } });
  await prisma.card.create({ data: { id: "legend1", variantId: "izuku-base", printNumber: 1, quality: "LEGENDARY", ownerId: owner.id, tag: "fav" } });
  await prisma.card.create({ data: { id: "common1", variantId: "halle-base", printNumber: 1, quality: "COMMON", ownerId: owner.id, tag: "fav" } });
  await prisma.card.create({ data: { id: "held001", variantId: "izuku-base", printNumber: 2, quality: "EPIC", ownerId: owner.id, tag: "fav" } });
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

test("several cards at the top quality are all named", () => {
  const text = multiburnConfirmText({
    tagName: "fav",
    emoji: "⭐",
    held: 0,
    awarded: 1000,
    cards: [
      { id: "a", quality: "LEGENDARY", characterName: "Izuku Midoriya" },
      { id: "b", quality: "LEGENDARY", characterName: "Katsuki Bakugou" },
      { id: "c", quality: "RARE", characterName: "Ochaco Uraraka" },
    ],
  });
  assert.match(text, /The rarest are ★★★★★ \*\*Izuku Midoriya\*\* and \*\*Katsuki Bakugou\*\*/);
});

test("a tag burn names the rarest card and skips one in a transfer", async () => {
  const plan = await planTaggedBurn("owner", "Fav");
  assert.equal(plan.cards.length, 2);
  assert.equal(plan.held, 1);
  assert.match(multiburnConfirmText(plan), /Burning \*\*2\*\* cards tagged ⭐ \*\*fav\*\*/);
  assert.match(multiburnConfirmText(plan), /The rarest is ★★★★★ \*\*Izuku Midoriya\*\*/);
  assert.match(multiburnConfirmText(plan), /That pays \*\*1040\*\* bits/);
  assert.equal(plan.awarded, 1040);
  const result = await burnTaggedCards("owner", "owner", "fav", plan.cards.map((card) => card.id));
  assert.equal(result.burned, 2);
  assert.equal(result.awarded, 1040);
  assert.equal(result.skipped, 0);
  assert.equal(await prisma.card.count({ where: { ownerId: (await prisma.user.findUnique({ where: { discordId: "owner" } }))!.id } }), 1);
  const owner = await prisma.user.findUnique({ where: { discordId: "owner" } });
  assert.equal(owner?.bits, 1040);
  assert.equal(owner?.lastGrabbedCardId, null);
  assert.equal((await prisma.card.findUnique({ where: { id: "held001" } }))?.tag, "fav");
});
