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
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "akira-tags-"));
const dbFile = path.join(dir, "test.db");

let prisma: PrismaClient;
let createTag: typeof import("./tags.js").createTag;
let deleteTag: typeof import("./tags.js").deleteTag;
let applyTag: typeof import("./tags.js").applyTag;
let clearTag: typeof import("./tags.js").clearTag;
let listTags: typeof import("./tags.js").listTags;

before(async () => {
  process.env["DATABASE_URL"] = `file:${dbFile}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: root,
    env: process.env,
    stdio: "pipe",
  });
  const db = await import("../db/client.js");
  const tags = await import("./tags.js");
  prisma = db.prisma;
  createTag = tags.createTag;
  deleteTag = tags.deleteTag;
  applyTag = tags.applyTag;
  clearTag = tags.clearTag;
  listTags = tags.listTags;

  const series = await prisma.series.create({ data: { name: "Death Note", slug: "death-note" } });
  const character = await prisma.character.create({
    data: { name: "Halle Bullook", slug: "halle", seriesId: series.id },
  });
  await prisma.cardVariant.create({
    data: { id: "halle-base", name: "Base", rarity: "Common", image: "base.png", characterId: character.id },
  });
  const owner = await prisma.user.create({ data: { discordId: "owner", discordUsername: "owner" } });
  await prisma.card.create({
    data: { id: "4bqz1p6", variantId: "halle-base", printNumber: 1, quality: "COMMON", ownerId: owner.id },
  });
  await prisma.card.create({
    data: { id: "untag01", variantId: "halle-base", printNumber: 2, quality: "COMMON", ownerId: owner.id },
  });
});

after(async () => {
  await prisma.$disconnect();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a tag marks owned cards and deleting it clears them", async () => {
  const created = await createTag("owner", "owner", "Fav", "⭐");
  assert.equal(created.name, "fav");
  assert.equal(created.emoji, "⭐");
  const applied = await applyTag("owner", "owner", "fav", ["4bqz1p6"]);
  assert.equal(applied.cards[0]?.tag, "fav");
  const stored = await prisma.card.findUnique({ where: { id: "4bqz1p6" } });
  assert.equal(stored?.tag, "fav");
  await assert.rejects(
    () => createTag("owner", "owner", "shop", "<:star:123>"),
    (err: unknown) => err instanceof GameError && err.code === "emoji",
  );
  const cleared = await clearTag("owner", "owner", ["4bqz1p6"]);
  assert.equal(cleared[0]?.tag, null);
  await applyTag("owner", "owner", "fav", ["4bqz1p6"]);
  const list = await listTags("owner");
  assert.equal(list.untagged, 1);
  assert.equal(list.tags[0]?.count, 1);
  await deleteTag("owner", "owner", "fav");
  assert.equal((await prisma.card.findUnique({ where: { id: "4bqz1p6" } }))?.tag, null);
  await assert.rejects(
    () => applyTag("owner", "owner", "fav", ["4bqz1p6"]),
    (err: unknown) => err instanceof GameError && err.code === "missing",
  );
});
