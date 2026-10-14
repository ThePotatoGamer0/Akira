import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "../generated/prisma/client.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "akira-game-"));
const dbFile = path.join(dir, "test.db");

let prisma: PrismaClient;
let claimReaction: typeof import("./drops.js").claimReaction;

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

async function makeDrop(messageId: string, expiresAt: Date, positions = [1]) {
  return prisma.drop.create({
    data: {
      guildId: "guild",
      channelId: "channel",
      messageId,
      expiresAt,
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
});
