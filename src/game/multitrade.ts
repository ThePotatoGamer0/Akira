import { prisma } from "../db/client.js";
import { mintCardCode } from "./codes.js";
import { GameError } from "./errors.js";
import type { ParsedTradeOffer } from "./multitrade-text.js";
import { ensureUser } from "./users.js";

/** Closes after this long with no agree, offer, or lock. */
export const MULTITRADE_WINDOW_MS = 10 * 60 * 1000;

const OPEN = ["request", "open"] as const;

export type MultitradeCard = {
  id: string;
  characterName: string;
};

export type MultitradeSide = {
  discordId: string;
  username: string;
  locked: boolean;
  bits: number;
  cards: MultitradeCard[];
};

export type MultitradeView = {
  id: string;
  status: "request" | "open" | "done" | "cancelled" | "expired";
  channelId: string;
  messageId: string | null;
  closeReason: string | null;
  from: MultitradeSide;
  to: MultitradeSide;
};

type TradeRow = {
  id: string;
  channelId: string;
  messageId: string | null;
  status: string;
  fromLocked: boolean;
  toLocked: boolean;
  closeReason: string | null;
  updatedAt: Date;
  fromUser: { id: string; discordId: string; discordUsername: string | null; bits: number };
  toUser: { id: string; discordId: string; discordUsername: string | null; bits: number };
};

const tradeInclude = { fromUser: true, toUser: true } as const;

function asStatus(status: string): MultitradeView["status"] {
  if (status === "open" || status === "done" || status === "cancelled" || status === "expired") return status;
  return "request";
}

function sideOf(
  user: TradeRow["fromUser"],
  locked: boolean,
  entries: { userId: string; cardId: string | null; bits: number }[],
  names: Map<string, string>,
): MultitradeSide {
  const mine = entries.filter((entry) => entry.userId === user.id);
  return {
    discordId: user.discordId,
    username: user.discordUsername ?? "friend",
    locked,
    bits: mine.reduce((sum, entry) => sum + entry.bits, 0),
    cards: mine.flatMap((entry) =>
      entry.cardId && names.has(entry.cardId)
        ? [{ id: entry.cardId, characterName: names.get(entry.cardId) ?? "Unknown" }]
        : [],
    ),
  };
}

async function toView(trade: TradeRow): Promise<MultitradeView> {
  const entries = await prisma.multitradeEntry.findMany({
    where: { tradeId: trade.id },
    orderBy: { createdAt: "asc" },
  });
  const cards = await prisma.card.findMany({
    where: { id: { in: entries.flatMap((entry) => (entry.cardId ? [entry.cardId] : [])) } },
    include: { variant: { include: { character: true } } },
  });
  const names = new Map(cards.map((card) => [card.id, card.variant.character.name]));
  return {
    id: trade.id,
    status: asStatus(trade.status),
    channelId: trade.channelId,
    messageId: trade.messageId,
    closeReason: trade.closeReason,
    from: sideOf(trade.fromUser, trade.fromLocked, entries, names),
    to: sideOf(trade.toUser, trade.toLocked, entries, names),
  };
}

function stale(trade: { updatedAt: Date }): boolean {
  return Date.now() - trade.updatedAt.getTime() > MULTITRADE_WINDOW_MS;
}

async function expire(id: string): Promise<TradeRow> {
  return prisma.multitrade.update({
    where: { id },
    data: { status: "expired" },
    include: tradeInclude,
  });
}

function party(trade: TradeRow, discordId: string): "from" | "to" {
  if (discordId === trade.fromUser.discordId) return "from";
  if (discordId === trade.toUser.discordId) return "to";
  throw new GameError("outsider", "This trade isn't yours.");
}

async function busyWithSomeone(userIds: string[]): Promise<boolean> {
  const open = await prisma.multitrade.findFirst({
    where: {
      status: { in: [...OPEN] },
      OR: [{ fromUserId: { in: userIds } }, { toUserId: { in: userIds } }],
    },
    select: { id: true },
  });
  return open !== null;
}

export async function proposeMultitrade(input: {
  fromDiscordId: string;
  fromUsername: string;
  toDiscordId: string;
  toUsername: string;
  guildId: string;
  channelId: string;
}): Promise<MultitradeView> {
  if (input.fromDiscordId === input.toDiscordId) {
    throw new GameError("self", "You can't trade with yourself.");
  }
  const from = await ensureUser(input.fromDiscordId, input.fromUsername);
  const to = await ensureUser(input.toDiscordId, input.toUsername);
  if (await busyWithSomeone([from.id, to.id])) {
    throw new GameError("busy", "One of you is already in a multitrade.");
  }
  const id = await mintCardCode(async (code) => {
    const existing = await prisma.multitrade.findUnique({ where: { id: code }, select: { id: true } });
    return existing !== null;
  });
  const trade = await prisma.multitrade.create({
    data: {
      id,
      guildId: input.guildId,
      channelId: input.channelId,
      fromUserId: from.id,
      toUserId: to.id,
    },
    include: tradeInclude,
  });
  return toView(trade);
}

export async function attachMultitradeMessage(id: string, messageId: string): Promise<void> {
  await prisma.multitrade.update({ where: { id }, data: { messageId } });
}

async function liveTrade(id: string): Promise<TradeRow> {
  const trade = await prisma.multitrade.findUnique({ where: { id }, include: tradeInclude });
  if (!trade) throw new GameError("closed", "This trade is no longer open.");
  if ((trade.status === "request" || trade.status === "open") && stale(trade)) return expire(id);
  return trade;
}

export async function agreeMultitrade(id: string, discordId: string): Promise<MultitradeView> {
  const trade = await liveTrade(id);
  if (trade.status === "expired") return toView(trade);
  const who = party(trade, discordId);
  if (trade.status !== "request") throw new GameError("closed", "This trade is no longer waiting for an answer.");
  if (who !== "to") throw new GameError("waiting", "Waiting on the other player to agree.");
  const opened = await prisma.multitrade.update({
    where: { id },
    data: { status: "open", updatedAt: new Date() },
    include: tradeInclude,
  });
  return toView(opened);
}

export async function cancelMultitrade(id: string, discordId: string): Promise<MultitradeView> {
  const trade = await liveTrade(id);
  if (trade.status === "expired") return toView(trade);
  party(trade, discordId);
  if (trade.status !== "request" && trade.status !== "open") {
    throw new GameError("closed", "This trade is no longer open.");
  }
  const cancelled = await prisma.multitrade.update({
    where: { id },
    data: { status: "cancelled" },
    include: tradeInclude,
  });
  return toView(cancelled);
}

function hasOffer(entries: { cardId: string | null; bits: number }[]): boolean {
  return entries.some((entry) => entry.cardId !== null || entry.bits > 0);
}

export async function lockMultitrade(id: string, discordId: string): Promise<MultitradeView> {
  const current = await liveTrade(id);
  if (current.status === "expired") return toView(current);
  const who = party(current, discordId);
  if (current.status !== "open") throw new GameError("closed", "This trade is no longer open.");
  if ((who === "from" && current.fromLocked) || (who === "to" && current.toLocked)) {
    throw new GameError("accepted", "You already locked in.");
  }

  const saved = await prisma.$transaction(async (tx) => {
    const trade = await tx.multitrade.findUnique({ where: { id }, include: tradeInclude });
    if (!trade || trade.status !== "open") throw new GameError("closed", "This trade is no longer open.");
    const entries = await tx.multitradeEntry.findMany({ where: { tradeId: id } });
    if (!hasOffer(entries)) {
      throw new GameError("empty", "Add a card or some bits before locking.");
    }
    const fromLocked = trade.fromLocked || who === "from";
    const toLocked = trade.toLocked || who === "to";
    if (!fromLocked || !toLocked) {
      const waiting = await tx.multitrade.update({
        where: { id },
        data: { fromLocked, toLocked, updatedAt: new Date() },
        include: tradeInclude,
      });
      return waiting;
    }

    const fromCards = entries.filter((entry) => entry.userId === trade.fromUserId && entry.cardId);
    const toCards = entries.filter((entry) => entry.userId === trade.toUserId && entry.cardId);
    const fromBits = entries.filter((entry) => entry.userId === trade.fromUserId).reduce((sum, entry) => sum + entry.bits, 0);
    const toBits = entries.filter((entry) => entry.userId === trade.toUserId).reduce((sum, entry) => sum + entry.bits, 0);
    const cardIds = [...fromCards, ...toCards].flatMap((entry) => (entry.cardId ? [entry.cardId] : []));
    const cards = await tx.card.findMany({ where: { id: { in: cardIds } } });
    const byId = new Map(cards.map((card) => [card.id, card]));
    const owned = (entry: { cardId: string | null; userId: string }) => {
      if (!entry.cardId) return false;
      return byId.get(entry.cardId)?.ownerId === entry.userId;
    };
    const cardsOk = fromCards.every(owned) && toCards.every(owned);
    const bitsOk = trade.fromUser.bits >= fromBits && trade.toUser.bits >= toBits;
    if (!cardsOk || !bitsOk) {
      return tx.multitrade.update({
        where: { id },
        data: {
          status: "cancelled",
          closeReason: cardsOk
            ? "Someone no longer has enough bits for this trade."
            : "A card in this trade changed hands.",
        },
        include: tradeInclude,
      });
    }
    for (const entry of fromCards) {
      if (!entry.cardId) continue;
      await tx.card.update({ where: { id: entry.cardId }, data: { ownerId: trade.toUserId, tag: null } });
    }
    for (const entry of toCards) {
      if (!entry.cardId) continue;
      await tx.card.update({ where: { id: entry.cardId }, data: { ownerId: trade.fromUserId, tag: null } });
    }
    await tx.user.update({
      where: { id: trade.fromUserId },
      data: { bits: trade.fromUser.bits - fromBits + toBits },
    });
    await tx.user.update({
      where: { id: trade.toUserId },
      data: { bits: trade.toUser.bits - toBits + fromBits },
    });
    return tx.multitrade.update({
      where: { id },
      data: { status: "done", fromLocked: true, toLocked: true },
      include: tradeInclude,
    });
  });
  return toView(saved);
}

export async function addToMultitrade(
  discordId: string,
  channelId: string,
  offer: ParsedTradeOffer,
): Promise<{ view: MultitradeView; waiting: boolean; duplicates: string[] } | null> {
  const user = await prisma.user.findUnique({ where: { discordId } });
  if (!user) return null;
  const trade = await prisma.multitrade.findFirst({
    where: {
      channelId,
      status: { in: [...OPEN] },
      OR: [{ fromUserId: user.id }, { toUserId: user.id }],
    },
    include: tradeInclude,
  });
  if (!trade) return null;
  if (stale(trade)) return { view: await toView(await expire(trade.id)), waiting: false, duplicates: [] };
  if (trade.status === "request") return { view: await toView(trade), waiting: true, duplicates: [] };

  const duplicates = await prisma.$transaction(async (tx) => {
    const fresh = await tx.multitrade.findUnique({ where: { id: trade.id }, include: tradeInclude });
    if (!fresh || fresh.status !== "open") throw new GameError("closed", "This trade is no longer open.");
    const mine = await tx.multitradeEntry.findMany({ where: { tradeId: fresh.id, userId: user.id } });
    const already = new Set(mine.flatMap((entry) => (entry.cardId ? [entry.cardId] : [])));
    const pending = offer.cards.filter((cardId) => !already.has(cardId));
    const repeated = offer.cards.filter((cardId) => already.has(cardId));
    if (pending.length === 0 && offer.bits === 0) {
      throw new GameError("already", `\`${repeated[0] ?? offer.cards[0]}\` is already in the trade.`);
    }
    const cards = await tx.card.findMany({
      where: { id: { in: pending } },
      select: { id: true, ownerId: true },
    });
    const byId = new Map(cards.map((card) => [card.id, card]));
    for (const cardId of pending) {
      const card = byId.get(cardId);
      if (!card) throw new GameError("missing", `Akira couldn't find a card with the id \`${cardId}\`.`);
      if (card.ownerId !== user.id) throw new GameError("not-owner", `\`${cardId}\` isn't yours.`);
    }
    const held = await heldElsewhere(tx, pending, fresh.id);
    if (held.length > 0) {
      throw new GameError("busy", `\`${held[0]}\` is already in an open trade.`);
    }
    const offeredBits = mine.reduce((sum, entry) => sum + entry.bits, 0);
    const nextBits = offeredBits + offer.bits;
    const balance = fresh.fromUser.id === user.id ? fresh.fromUser.bits : fresh.toUser.bits;
    if (nextBits > balance) {
      throw new GameError("bits", `You have ${balance} bits. ${nextBits} is more than that.`);
    }
    for (const cardId of pending) {
      await tx.multitradeEntry.create({ data: { tradeId: fresh.id, userId: user.id, cardId } });
    }
    if (offer.bits > 0) {
      const row = mine.find((entry) => entry.cardId === null);
      if (row) {
        await tx.multitradeEntry.update({ where: { id: row.id }, data: { bits: row.bits + offer.bits } });
      } else {
        await tx.multitradeEntry.create({ data: { tradeId: fresh.id, userId: user.id, bits: offer.bits } });
      }
    }
    await tx.multitrade.update({
      where: { id: fresh.id },
      data: { fromLocked: false, toLocked: false, updatedAt: new Date() },
    });
    return repeated;
  });
  const updated = await prisma.multitrade.findUnique({ where: { id: trade.id }, include: tradeInclude });
  if (!updated) throw new GameError("closed", "This trade is no longer open.");
  return { view: await toView(updated), waiting: false, duplicates };
}

async function heldElsewhere(
  tx: Pick<typeof prisma, "transferOffer" | "multitradeEntry">,
  cardIds: string[],
  tradeId: string,
): Promise<string[]> {
  if (cardIds.length === 0) return [];
  const offers = await tx.transferOffer.findMany({
    where: {
      status: "pending",
      OR: [{ fromCardId: { in: cardIds } }, { toCardId: { in: cardIds } }],
    },
    select: { fromCardId: true, toCardId: true },
  });
  const entries = await tx.multitradeEntry.findMany({
    where: {
      cardId: { in: cardIds },
      tradeId: { not: tradeId },
      trade: { status: { in: ["request", "open"] } },
    },
    select: { cardId: true },
  });
  const held = new Set<string>();
  for (const offer of offers) {
    held.add(offer.fromCardId);
    if (offer.toCardId) held.add(offer.toCardId);
  }
  for (const entry of entries) {
    if (entry.cardId) held.add(entry.cardId);
  }
  return cardIds.filter((cardId) => held.has(cardId));
}
