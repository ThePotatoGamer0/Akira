import { Router } from "express";
import type { CardQuality, Prisma } from "../../../../src/generated/prisma/client.js";
import { burnOwnedCards, quoteOwnedBurn } from "../../../../src/game/economy.js";
import { displayFrameId, frameIdsOnDisk, serverDefaultFrame, setCardFrame } from "../../../../src/game/frames.js";
import { GameError } from "../../../../src/game/errors.js";
import { applyTag, clearTag, createTag, deleteTag, listTags } from "../../../../src/game/tags.js";
import { prisma } from "../db/client.js";
import { authMiddleware } from "../middleware/auth.js";

const CONDITION_WORDS: [CardQuality, string][] = [
  ["COMMON", "damaged"],
  ["UNCOMMON", "poor"],
  ["RARE", "good"],
  ["EPIC", "excellent"],
  ["LEGENDARY", "mint"],
];

const CARD_INCLUDE = {
  variant: {
    include: {
      character: { include: { series: true } },
    },
  },
} as const;

export const collectionRouter = Router();

collectionRouter.use(authMiddleware);

function ownerOrAdmin(viewerId: string, isAdmin: boolean, userId: string): boolean {
  return viewerId === userId || isAdmin;
}

function gameMessage(err: unknown): string {
  const message = err instanceof GameError ? err.message : "Akira tripped over something. Mind trying again in a moment?";
  return message.replaceAll("**", "");
}

function dyeKey(dye: string | null): string {
  return dye && /^[a-zA-Z0-9_-]+$/.test(dye) ? dye : "none";
}

function assetBase(variantId: string, frameId: number, printNumber: number, dye: string | null): string {
  return `/api/static/cards/${variantId}/${frameId}/p${printNumber}/${dyeKey(dye)}`;
}

function guildForBuffs(): string | null {
  const id = process.env["DISCORD_GUILD_ID"] ?? process.env["AKIRA_GUILD_ID"] ?? "";
  return id || null;
}

function cardIdList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.some((id) => typeof id !== "string")) return null;
  return value;
}

function queryParam(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

function queryCount(value: unknown, fallback: number, max: number, min = 0): number {
  const raw = queryParam(value);
  if (!/^\d+$/.test(raw)) return fallback;
  return Math.min(max, Math.max(min, Number(raw)));
}

function qualitiesForQuery(q: string): CardQuality[] {
  const needle = q.toLowerCase();
  return CONDITION_WORDS.filter(([, word]) => word.includes(needle)).map(([quality]) => quality);
}

const COLLECTION_ORDERS = ["character", "series", "quality", "tag"] as const;
type CollectionOrder = (typeof COLLECTION_ORDERS)[number];

/** Mint first, then down through damaged. SQLite would otherwise sort the enum names alphabetically. */
const QUALITY_RANK: Record<string, number> = {
  LEGENDARY: 0,
  EPIC: 1,
  RARE: 2,
  UNCOMMON: 3,
  COMMON: 4,
};

function collectionOrder(value: string): CollectionOrder {
  return (COLLECTION_ORDERS as readonly string[]).includes(value) ? (value as CollectionOrder) : "character";
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

type SortRow = {
  id: string;
  tag: string | null;
  quality: string;
  printNumber: number;
  character: string;
  series: string;
};

function compareCards(order: CollectionOrder, a: SortRow, b: SortRow): number {
  if (order === "series") {
    const series = compareText(a.series, b.series);
    if (series !== 0) return series;
  } else if (order === "quality") {
    const quality = (QUALITY_RANK[a.quality] ?? 9) - (QUALITY_RANK[b.quality] ?? 9);
    if (quality !== 0) return quality;
  } else if (order === "tag") {
    const aUntagged = !a.tag;
    const bUntagged = !b.tag;
    if (aUntagged !== bUntagged) return aUntagged ? 1 : -1;
    if (a.tag && b.tag) {
      const tag = compareText(a.tag, b.tag);
      if (tag !== 0) return tag;
    }
  }
  const name = compareText(a.character, b.character);
  if (name !== 0) return name;
  if (a.printNumber !== b.printNumber) return a.printNumber - b.printNumber;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function collectionWhere(userId: string, q: string): Prisma.CardWhereInput {
  const where: Prisma.CardWhereInput = { ownerId: userId };
  if (!q) return where;
  const or: Prisma.CardWhereInput[] = [
    { id: { contains: q.toLowerCase() } },
    { tag: { contains: q.toLowerCase() } },
    { variant: { name: { contains: q } } },
    { variant: { character: { name: { contains: q } } } },
    { variant: { character: { series: { name: { contains: q } } } } },
  ];
  const qualities = qualitiesForQuery(q);
  if (qualities.length > 0) or.push({ quality: { in: qualities } });
  if (/^\d{1,6}$/.test(q)) or.push({ printNumber: Number(q) });
  where.OR = or;
  return where;
}

collectionRouter.get("/:userId/studio", async (req, res) => {
  const userId = req.params["userId"] ?? "";
  const viewer = req.user!;
  if (!ownerOrAdmin(viewer.id, viewer.isAdmin, userId)) {
    res.status(403).json({ error: "Akira can only show that collection to its owner (or an admin)." });
    return;
  }
  const owner = await prisma.user.findUnique({ where: { id: userId }, select: { discordId: true } });
  if (!owner) {
    res.status(404).json({ error: "Akira couldn't find that player." });
    return;
  }
  const [serverFrame, tags] = await Promise.all([
    serverDefaultFrame(process.env["DISCORD_GUILD_ID"] ?? null),
    listTags(owner.discordId),
  ]);
  res.json({
    serverFrame,
    frames: frameIdsOnDisk(),
    tags: tags.tags,
  });
});

collectionRouter.post("/:userId/tags", async (req, res) => {
  const userId = req.params["userId"] ?? "";
  const viewer = req.user!;
  if (viewer.id !== userId) {
    res.status(403).json({ error: "Akira only lets you manage your own tags." });
    return;
  }
  const body = req.body as { name?: unknown; emoji?: unknown };
  if (typeof body.name !== "string" || typeof body.emoji !== "string") {
    res.status(400).json({ error: "Akira needs a tag name and an emoji." });
    return;
  }
  try {
    const tag = await createTag(viewer.discordId, viewer.discordUsername ?? viewer.discordId, body.name, body.emoji);
    res.json({ name: tag.name, emoji: tag.emoji });
  } catch (err) {
    res.status(400).json({ error: gameMessage(err) });
  }
});

collectionRouter.delete("/:userId/tags/:name", async (req, res) => {
  const userId = req.params["userId"] ?? "";
  const viewer = req.user!;
  if (viewer.id !== userId) {
    res.status(403).json({ error: "Akira only lets you manage your own tags." });
    return;
  }
  try {
    const tag = await deleteTag(viewer.discordId, viewer.discordUsername ?? viewer.discordId, req.params["name"] ?? "");
    res.json({ name: tag.name, emoji: tag.emoji });
  } catch (err) {
    res.status(400).json({ error: gameMessage(err) });
  }
});

collectionRouter.post("/:userId/burn-quote", async (req, res) => {
  const userId = req.params["userId"] ?? "";
  const viewer = req.user!;
  if (viewer.id !== userId) {
    res.status(403).json({ error: "Akira only burns cards you own." });
    return;
  }
  const cardIds = cardIdList((req.body as { cardIds?: unknown }).cardIds);
  if (!cardIds) {
    res.status(400).json({ error: "Akira needs a card code for that." });
    return;
  }
  try {
    const quote = await quoteOwnedBurn(viewer.discordId, viewer.discordUsername ?? viewer.discordId, cardIds, guildForBuffs());
    res.json(quote);
  } catch (err) {
    res.status(400).json({ error: gameMessage(err) });
  }
});

collectionRouter.post("/:userId/burn", async (req, res) => {
  const userId = req.params["userId"] ?? "";
  const viewer = req.user!;
  if (viewer.id !== userId) {
    res.status(403).json({ error: "Akira only burns cards you own." });
    return;
  }
  const cardIds = cardIdList((req.body as { cardIds?: unknown }).cardIds);
  if (!cardIds) {
    res.status(400).json({ error: "Akira needs a card code for that." });
    return;
  }
  try {
    const result = await burnOwnedCards(viewer.discordId, viewer.discordUsername ?? viewer.discordId, cardIds, guildForBuffs());
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: gameMessage(err) });
  }
});

collectionRouter.post("/:userId/tag-cards", async (req, res) => {
  const userId = req.params["userId"] ?? "";
  const viewer = req.user!;
  if (viewer.id !== userId) {
    res.status(403).json({ error: "Akira only changes cards you own." });
    return;
  }
  const body = req.body as { tag?: unknown; cardIds?: unknown };
  const cardIds = cardIdList(body.cardIds);
  if (!cardIds || (body.tag !== null && typeof body.tag !== "string")) {
    res.status(400).json({ error: "Akira needs a tag name and a card code for that." });
    return;
  }
  try {
    const username = viewer.discordUsername ?? viewer.discordId;
    if (body.tag === null) await clearTag(viewer.discordId, username, cardIds);
    else await applyTag(viewer.discordId, username, body.tag, cardIds);
    const tags = await prisma.tag.findMany({ where: { userId: viewer.id } });
    const emoji = body.tag === null ? "◾" : tags.find((tag) => tag.name === body.tag)?.emoji ?? "◾";
    res.json({ tag: body.tag, tagEmoji: emoji, cardIds: cardIds.map((id) => id.trim().toLowerCase()) });
  } catch (err) {
    res.status(400).json({ error: gameMessage(err) });
  }
});

collectionRouter.patch("/:userId/cards/:cardId", async (req, res) => {
  const userId = req.params["userId"] ?? "";
  const cardId = (req.params["cardId"] ?? "").toLowerCase();
  const viewer = req.user!;
  if (viewer.id !== userId) {
    res.status(403).json({ error: "Akira only changes cards you own." });
    return;
  }
  const body = req.body as { frameId?: unknown; tag?: unknown };
  const hasFrame = Object.hasOwn(body, "frameId");
  const hasTag = Object.hasOwn(body, "tag");
  if (hasFrame && body.frameId !== null && (typeof body.frameId !== "number" || !Number.isInteger(body.frameId) || body.frameId < 0)) {
    res.status(400).json({ error: "Akira needs a frame id for that." });
    return;
  }
  if (hasTag && body.tag !== null && typeof body.tag !== "string") {
    res.status(400).json({ error: "Akira needs a tag name for that." });
    return;
  }
  try {
    const username = viewer.discordUsername ?? viewer.discordId;
    if (hasFrame) {
      const nextFrame = body.frameId;
      if (nextFrame !== null && typeof nextFrame !== "number") {
        res.status(400).json({ error: "Akira needs a frame id for that." });
        return;
      }
      await setCardFrame(viewer.discordId, cardId, nextFrame);
    }
    if (hasTag) {
      const nextTag = body.tag;
      if (nextTag === null) await clearTag(viewer.discordId, username, [cardId]);
      else if (typeof nextTag === "string") await applyTag(viewer.discordId, username, nextTag, [cardId]);
      else {
        res.status(400).json({ error: "Akira needs a tag name for that." });
        return;
      }
    }
    const card = await prisma.card.findUnique({
      where: { id: cardId },
      include: { variant: true },
    });
    if (!card || card.ownerId !== viewer.id) {
      res.status(404).json({ error: "Akira couldn't find that card." });
      return;
    }
    const serverFrame = await serverDefaultFrame(process.env["DISCORD_GUILD_ID"] ?? null);
    const frameId = displayFrameId(card.frameId, serverFrame);
    const tags = await prisma.tag.findMany({ where: { userId: viewer.id } });
    const emoji = card.tag ? tags.find((tag) => tag.name === card.tag)?.emoji ?? "◾" : "◾";
    const base = assetBase(card.variantId, frameId, card.printNumber, card.dye);
    res.json({
      frameChoice: card.frameId,
      frameId,
      tag: card.tag,
      tagEmoji: emoji,
      assets: {
        normal: `${base}/normal.png`,
        shiny: `${base}/shiny.apng`,
        burn: `${base}/burn.apng`,
      },
    });
  } catch (err) {
    res.status(400).json({ error: gameMessage(err) });
  }
});

collectionRouter.get("/:userId", async (req, res) => {
  const userId = req.params["userId"] ?? "";
  const viewer = req.user!;
  if (viewer.id !== userId && !viewer.isAdmin) {
    res.status(403).json({ error: "Akira can only show that collection to its owner (or an admin)." });
    return;
  }

  const limit = queryCount(req.query["limit"], 16, 32, 1);
  const offset = queryCount(req.query["offset"], 0, 100_000);
  const q = queryParam(req.query["q"]).trim().slice(0, 80);
  const order = collectionOrder(queryParam(req.query["order"]));
  const where = collectionWhere(userId, q);

  const [owned, total, ranked, serverFrame, tags] = await Promise.all([
    prisma.card.count({ where: { ownerId: userId } }),
    prisma.card.count({ where }),
    prisma.card.findMany({
      where,
      select: {
        id: true,
        tag: true,
        quality: true,
        printNumber: true,
        variant: { select: { character: { select: { name: true, series: { select: { name: true } } } } } },
      },
    }),
    serverDefaultFrame(process.env["DISCORD_GUILD_ID"] ?? null),
    prisma.tag.findMany({ where: { userId } }),
  ]);
  const pageIds = ranked
    .map((card) => ({
      id: card.id,
      tag: card.tag,
      quality: card.quality,
      printNumber: card.printNumber,
      character: card.variant.character.name,
      series: card.variant.character.series.name,
    }))
    .sort((a, b) => compareCards(order, a, b))
    .slice(offset, offset + limit)
    .map((card) => card.id);
  const found = pageIds.length === 0
    ? []
    : await prisma.card.findMany({ where: { id: { in: pageIds } }, include: CARD_INCLUDE });
  const byId = new Map(found.map((card) => [card.id, card]));
  const cards = pageIds.flatMap((id) => {
    const card = byId.get(id);
    return card ? [card] : [];
  });
  const tagEmoji = new Map(tags.map((tag) => [tag.name, tag.emoji]));

  res.json({
    total,
    owned,
    limit,
    offset,
    cards: cards.map((c) => {
      const { character: ch } = c.variant;
      const frameId = displayFrameId(c.frameId, serverFrame);
      const base = assetBase(c.variant.id, frameId, c.printNumber, c.dye);

      return {
        id: c.id,
        printNumber: c.printNumber,
        quality: c.quality,
        frameChoice: c.frameId,
        frameId,
        tag: c.tag,
        tagEmoji: c.tag ? tagEmoji.get(c.tag) ?? "◾" : "◾",
        alias: c.alias,
        dye: c.dye,
        obtainedAt: c.obtainedAt,
        variant: { id: c.variant.id, name: c.variant.name },
        character: { id: ch.id, name: ch.name, slug: ch.slug },
        series: { id: ch.series.id, name: ch.series.name, slug: ch.series.slug },
        assets: {
          normal: `${base}/normal.png`,
          shiny: `${base}/shiny.apng`,
          burn: `${base}/burn.apng`,
        },
      };
    }),
  });
});