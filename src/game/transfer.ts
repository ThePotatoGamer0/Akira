import { prisma } from "../db/client.js";
import { mintCardCode } from "./codes.js";
import { GameError } from "./errors.js";
import { ensureUser } from "./users.js";

/** How long both players have to accept. */
export const TRANSFER_WINDOW_MS = 5 * 60 * 1000;

const cardInclude = {
  variant: { include: { character: { include: { series: true } } } },
  owner: true,
} as const;

export type TransferCard = {
  id: string;
  quality: string;
  printNumber: number;
  frameId: number | null;
  dye: string | null;
  seriesName: string;
  characterName: string;
  seriesSlug: string;
  characterSlug: string;
  variantId: string;
  imageFile: string;
  tag: string | null;
};

export type TransferView = {
  id: string;
  kind: "give" | "trade";
  status: "pending" | "done" | "cancelled" | "expired";
  fromDiscordId: string;
  toDiscordId: string;
  fromConfirmed: boolean;
  toConfirmed: boolean;
  fromCard: TransferCard | null;
  toCard: TransferCard | null;
  /** Set when the cards moved before both players accepted. */
  changed: boolean;
};

type OfferRow = {
  id: string;
  kind: string;
  fromUserId: string;
  toUserId: string;
  fromCardId: string;
  toCardId: string | null;
  fromConfirmed: boolean;
  toConfirmed: boolean;
  status: string;
  createdAt: Date;
  fromUser: { discordId: string };
  toUser: { discordId: string };
};

function asCard(card: {
  id: string;
  quality: string;
  printNumber: number;
  frameId: number | null;
  dye: string | null;
  tag: string | null;
  variantId: string;
  variant: { image: string; character: { slug: string; name: string; series: { slug: string; name: string } } };
}): TransferCard {
  return {
    id: card.id,
    quality: card.quality,
    printNumber: card.printNumber,
    frameId: card.frameId,
    dye: card.dye,
    seriesName: card.variant.character.series.name,
    characterName: card.variant.character.name,
    seriesSlug: card.variant.character.series.slug,
    characterSlug: card.variant.character.slug,
    variantId: card.variantId,
    imageFile: card.variant.image,
    tag: card.tag,
  };
}

async function loadCard(cardId: string) {
  return prisma.card.findUnique({
    where: { id: cardId.trim().toLowerCase() },
    include: cardInclude,
  });
}

export async function cardInOpenTransfer(cardId: string): Promise<boolean> {
  const open = await prisma.transferOffer.findFirst({
    where: {
      status: "pending",
      OR: [{ fromCardId: cardId }, { toCardId: cardId }],
    },
    select: { id: true },
  });
  return open !== null;
}

async function assertCardsFree(cardIds: string[]): Promise<void> {
  const open = await prisma.transferOffer.findFirst({
    where: {
      status: "pending",
      OR: [{ fromCardId: { in: cardIds } }, { toCardId: { in: cardIds } }],
    },
    select: { id: true },
  });
  if (open) throw new GameError("busy", "That card is already in an open give or trade.");
}

async function toView(offer: OfferRow, changed = false): Promise<TransferView> {
  const fromCard = await prisma.card.findUnique({ where: { id: offer.fromCardId }, include: cardInclude });
  const toCard = offer.toCardId
    ? await prisma.card.findUnique({ where: { id: offer.toCardId }, include: cardInclude })
    : null;
  const status = offer.status === "done" || offer.status === "cancelled" || offer.status === "expired"
    ? offer.status
    : "pending";
  return {
    id: offer.id,
    kind: offer.kind === "trade" ? "trade" : "give",
    status,
    fromDiscordId: offer.fromUser.discordId,
    toDiscordId: offer.toUser.discordId,
    fromConfirmed: offer.fromConfirmed,
    toConfirmed: offer.toConfirmed,
    fromCard: fromCard ? asCard(fromCard) : null,
    toCard: toCard ? asCard(toCard) : null,
    changed,
  };
}

const offerInclude = { fromUser: true, toUser: true } as const;

async function mintOfferId(): Promise<string> {
  return mintCardCode(async (id) => {
    const existing = await prisma.transferOffer.findUnique({ where: { id }, select: { id: true } });
    return existing !== null;
  });
}

export async function proposeGive(input: {
  fromDiscordId: string;
  fromUsername: string;
  toDiscordId: string;
  toUsername: string;
  cardId: string;
}): Promise<TransferView> {
  if (input.fromDiscordId === input.toDiscordId) {
    throw new GameError("self", "You can't give a card to yourself.");
  }
  const from = await ensureUser(input.fromDiscordId, input.fromUsername);
  const to = await ensureUser(input.toDiscordId, input.toUsername);
  const card = await loadCard(input.cardId);
  if (!card) throw new GameError("missing", `Akira couldn't find a card with the id \`${input.cardId.trim().toLowerCase()}\`.`);
  if (card.ownerId !== from.id) throw new GameError("not-owner", "That card isn't yours.");
  await assertCardsFree([card.id]);
  const id = await mintOfferId();
  const offer = await prisma.transferOffer.create({
    data: {
      id,
      kind: "give",
      fromUserId: from.id,
      toUserId: to.id,
      fromCardId: card.id,
    },
    include: offerInclude,
  });
  return toView(offer);
}

export async function proposeTrade(input: {
  fromDiscordId: string;
  fromUsername: string;
  toDiscordId: string;
  toUsername: string;
  cardId: string;
  theirCardId: string;
}): Promise<TransferView> {
  if (input.fromDiscordId === input.toDiscordId) {
    throw new GameError("self", "You can't trade with yourself.");
  }
  const from = await ensureUser(input.fromDiscordId, input.fromUsername);
  const to = await ensureUser(input.toDiscordId, input.toUsername);
  const card = await loadCard(input.cardId);
  const their = await loadCard(input.theirCardId);
  if (!card) throw new GameError("missing", `Akira couldn't find a card with the id \`${input.cardId.trim().toLowerCase()}\`.`);
  if (!their) throw new GameError("missing", `Akira couldn't find a card with the id \`${input.theirCardId.trim().toLowerCase()}\`.`);
  if (card.id === their.id) throw new GameError("same", "Pick two different cards.");
  if (card.ownerId !== from.id) throw new GameError("not-owner", "That card isn't yours.");
  if (their.ownerId !== to.id) throw new GameError("not-owner", "That card isn't theirs.");
  await assertCardsFree([card.id, their.id]);
  const id = await mintOfferId();
  const offer = await prisma.transferOffer.create({
    data: {
      id,
      kind: "trade",
      fromUserId: from.id,
      toUserId: to.id,
      fromCardId: card.id,
      toCardId: their.id,
    },
    include: offerInclude,
  });
  return toView(offer);
}

async function lockedOffer(id: string): Promise<OfferRow> {
  const offer = await prisma.transferOffer.findUnique({ where: { id }, include: offerInclude });
  if (!offer) throw new GameError("closed", "This offer is no longer open.");
  return offer;
}

function party(offer: OfferRow, discordId: string): "from" | "to" {
  if (discordId === offer.fromUser.discordId) return "from";
  if (discordId === offer.toUser.discordId) return "to";
  throw new GameError("outsider", "This offer isn't yours.");
}

/** If the window has passed, close the offer and return it. Otherwise return null. */
export async function claimExpiry(offerId: string): Promise<TransferView | null> {
  const offer = await prisma.transferOffer.findUnique({ where: { id: offerId }, include: offerInclude });
  if (!offer || offer.status !== "pending") return null;
  if (Date.now() - offer.createdAt.getTime() <= TRANSFER_WINDOW_MS) return null;
  const closed = await prisma.transferOffer.update({
    where: { id: offer.id },
    data: { status: "expired" },
    include: offerInclude,
  });
  return toView(closed);
}

/** The card on one side of an open offer, for the question-mark button. */
export async function offerSide(offerId: string, discordId: string): Promise<TransferView> {
  const offer = await lockedOffer(offerId);
  party(offer, discordId);
  if (offer.status !== "pending") throw new GameError("closed", "This offer is no longer open.");
  return toView(offer);
}

export async function acceptTransfer(offerId: string, discordId: string): Promise<TransferView> {
  const current = await lockedOffer(offerId);
  const who = party(current, discordId);
  if (current.status !== "pending") throw new GameError("closed", "This offer is no longer open.");
  if (Date.now() - current.createdAt.getTime() > TRANSFER_WINDOW_MS) {
    const closed = await prisma.transferOffer.update({
      where: { id: current.id },
      data: { status: "expired" },
      include: offerInclude,
    });
    return toView(closed);
  }
  if ((who === "from" && current.fromConfirmed) || (who === "to" && current.toConfirmed)) {
    throw new GameError("accepted", "You already accepted.");
  }

  const saved = await prisma.$transaction(async (tx) => {
    const offer = await tx.transferOffer.findUnique({ where: { id: offerId }, include: offerInclude });
    if (!offer || offer.status !== "pending") throw new GameError("closed", "This offer is no longer open.");
    const fromConfirmed = offer.fromConfirmed || who === "from";
    const toConfirmed = offer.toConfirmed || who === "to";
    if (!fromConfirmed || !toConfirmed) {
      const waiting = await tx.transferOffer.update({
        where: { id: offer.id },
        data: { fromConfirmed, toConfirmed },
        include: offerInclude,
      });
      return { offer: waiting, changed: false };
    }

    const fromCard = await tx.card.findUnique({ where: { id: offer.fromCardId } });
    const toCard = offer.toCardId ? await tx.card.findUnique({ where: { id: offer.toCardId } }) : null;
    const giveOk = fromCard?.ownerId === offer.fromUserId;
    const tradeOk = offer.kind !== "trade" || toCard?.ownerId === offer.toUserId;
    if (!giveOk || !tradeOk || (offer.kind === "trade" && !toCard)) {
      const cancelled = await tx.transferOffer.update({
        where: { id: offer.id },
        data: { status: "cancelled", fromConfirmed, toConfirmed },
        include: offerInclude,
      });
      return { offer: cancelled, changed: true };
    }
    await tx.card.update({ where: { id: fromCard.id }, data: { ownerId: offer.toUserId, tag: null } });
    if (offer.kind === "trade" && toCard) {
      await tx.card.update({ where: { id: toCard.id }, data: { ownerId: offer.fromUserId, tag: null } });
    }
    const done = await tx.transferOffer.update({
      where: { id: offer.id },
      data: { status: "done", fromConfirmed: true, toConfirmed: true },
      include: offerInclude,
    });
    return { offer: done, changed: false };
  });
  return toView(saved.offer, saved.changed);
}

export async function cancelTransfer(offerId: string, discordId: string): Promise<TransferView> {
  const current = await lockedOffer(offerId);
  party(current, discordId);
  if (current.status !== "pending") throw new GameError("closed", "This offer is no longer open.");
  if (Date.now() - current.createdAt.getTime() > TRANSFER_WINDOW_MS) {
    const closed = await prisma.transferOffer.update({
      where: { id: current.id },
      data: { status: "expired" },
      include: offerInclude,
    });
    return toView(closed);
  }
  const cancelled = await prisma.transferOffer.update({
    where: { id: current.id },
    data: { status: "cancelled" },
    include: offerInclude,
  });
  return toView(cancelled);
}
