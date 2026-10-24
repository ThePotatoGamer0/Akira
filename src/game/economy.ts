import { prisma } from "../db/client.js";
import { DAILY_COOLDOWN_MS, dailyPayout, formatRemaining, scaledBurnPayout, type Quality } from "./balance.js";
import { isCardCode } from "./codes.js";
import { activeEffects } from "./live-buffs.js";
import { ensureCardImage } from "./compose.js";
import { displayFrameId, serverDefaultFrame } from "./frames.js";
import { GameError } from "./errors.js";
import { cardInOpenTransfer, cardsHeldInOpenTransfers } from "./transfer.js";
import { ensureUser } from "./users.js";

const BURN_BATCH_LIMIT = 100;

export type OwnedBurnQuote = {
  burning: string[];
  awarded: number;
  skipped: number;
  boosted: boolean;
};

export async function readTimers(discordId: string): Promise<{ dropMs: number; grabMs: number; dailyMs: number }> {
  const user = await prisma.user.findUnique({ where: { discordId } });
  if (!user) return { dropMs: 0, grabMs: 0, dailyMs: 0 };
  const rows = await prisma.cooldown.findMany({ where: { userId: user.id } });
  const now = Date.now();
  const remaining = (type: "DROP" | "GRAB" | "DAILY") => {
    const row = rows.find((item) => item.type === type);
    if (!row) return 0;
    return Math.max(0, row.expiresAt.getTime() - now);
  };
  return { dropMs: remaining("DROP"), grabMs: remaining("GRAB"), dailyMs: remaining("DAILY") };
}

export async function claimDaily(discordId: string, username: string): Promise<{ awarded: number; balance: number }> {
  const user = await ensureUser(discordId, username);
  const existing = await prisma.cooldown.findUnique({
    where: { userId_type: { userId: user.id, type: "DAILY" } },
  });
  if (existing && existing.expiresAt.getTime() > Date.now()) {
    throw new GameError(
      "cooldown",
      `Akira already set your daily bits aside. Come back in ${formatRemaining(existing.expiresAt.getTime() - Date.now())}.`,
    );
  }
  const awarded = dailyPayout(user.passiveBitsBonus);
  const expiresAt = new Date(Date.now() + DAILY_COOLDOWN_MS);
  const updated = await prisma.$transaction(async (tx) => {
    const again = await tx.cooldown.findUnique({
      where: { userId_type: { userId: user.id, type: "DAILY" } },
    });
    if (again && again.expiresAt.getTime() > Date.now()) {
      throw new GameError("cooldown", "Akira already set your daily bits aside.");
    }
    const next = await tx.user.update({
      where: { id: user.id },
      data: { bits: { increment: awarded } },
    });
    await tx.cooldown.upsert({
      where: { userId_type: { userId: user.id, type: "DAILY" } },
      create: { userId: user.id, type: "DAILY", expiresAt },
      update: { expiresAt },
    });
    return next;
  });
  return { awarded, balance: updated.bits };
}

function normalizeBurnIds(rawIds: string[]): string[] {
  const ids = [...new Set(rawIds.map((id) => id.trim().toLowerCase()).filter(Boolean))];
  if (ids.length === 0 || ids.some((id) => !isCardCode(id))) {
    throw new GameError("cards", "Akira needs a card code for that.");
  }
  if (ids.length > BURN_BATCH_LIMIT) {
    throw new GameError("cards", "Akira can burn 100 cards at a time.");
  }
  return ids;
}

/** Burn value and prestige apply to every card, one or a pile. */
async function planOwnedBurn(
  discordId: string,
  username: string,
  rawIds: string[],
  guildId: string | null,
): Promise<OwnedBurnQuote & { userId: string }> {
  const ids = normalizeBurnIds(rawIds);
  const user = await ensureUser(discordId, username);
  const owned = await prisma.card.findMany({
    where: { id: { in: ids } },
    select: { id: true, ownerId: true, quality: true },
  });
  const mine = new Map(owned.filter((card) => card.ownerId === user.id).map((card) => [card.id, card]));
  if (mine.size !== ids.length) {
    throw new GameError("not-owner", "Akira only burns cards that belong to you.");
  }
  const busy = await cardsHeldInOpenTransfers(ids);
  const burning = ids.filter((id) => !busy.has(id));
  if (burning.length === 0) {
    throw new GameError("busy", ids.length === 1 ? "That card is in an open trade." : "Those cards are in an open trade.");
  }
  const multiplier = (await activeEffects(user.id, guildId)).burnMultiplier;
  const awarded = burning.reduce((sum, id) => sum + scaledBurnPayout(mine.get(id)?.quality ?? "COMMON", multiplier), 0);
  return {
    userId: user.id,
    burning,
    awarded,
    skipped: ids.length - burning.length,
    boosted: multiplier !== 1,
  };
}

export async function quoteOwnedBurn(
  discordId: string,
  username: string,
  rawIds: string[],
  guildId: string | null = null,
): Promise<OwnedBurnQuote> {
  const plan = await planOwnedBurn(discordId, username, rawIds, guildId);
  return { burning: plan.burning, awarded: plan.awarded, skipped: plan.skipped, boosted: plan.boosted };
}

export async function burnOwnedCards(
  discordId: string,
  username: string,
  rawIds: string[],
  guildId: string | null = null,
): Promise<OwnedBurnQuote & { balance: number }> {
  const ids = normalizeBurnIds(rawIds);
  const plan = await planOwnedBurn(discordId, username, ids, guildId);
  const user = await ensureUser(discordId, username);
  const multiplier = (await activeEffects(user.id, guildId)).burnMultiplier;
  const updated = await prisma.$transaction(async (tx) => {
    const fresh = await tx.card.findMany({
      where: { id: { in: plan.burning }, ownerId: plan.userId },
      select: { id: true, quality: true },
    });
    if (fresh.length === 0) {
      throw new GameError("empty", "Those cards aren't yours to burn anymore.");
    }
    const awarded = fresh.reduce((sum, card) => sum + scaledBurnPayout(card.quality, multiplier), 0);
    const burnIds = fresh.map((card) => card.id);
    await tx.card.deleteMany({ where: { id: { in: burnIds }, ownerId: plan.userId } });
    const current = await tx.user.findUnique({ where: { id: plan.userId } });
    const clearGrab = current?.lastGrabbedCardId != null && burnIds.includes(current.lastGrabbedCardId);
    const next = await tx.user.update({
      where: { id: plan.userId },
      data: {
        bits: { increment: awarded },
        ...(clearGrab ? { lastGrabbedCardId: null } : {}),
      },
    });
    return {
      user: next,
      burning: burnIds,
      awarded,
      skipped: ids.length - burnIds.length,
      boosted: multiplier !== 1,
    };
  });
  return {
    burning: updated.burning,
    awarded: updated.awarded,
    skipped: updated.skipped,
    boosted: updated.boosted,
    balance: updated.user.bits,
  };
}

export async function burnOwnedCard(discordId: string, username: string, cardId: string, guildId: string | null = null): Promise<{
  awarded: number;
  balance: number;
  imagePath: string;
  characterName: string;
  printNumber: number;
  quality: Quality;
}> {
  const user = await ensureUser(discordId, username);
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    include: {
      owner: true,
      variant: { include: { character: { include: { series: true } } } },
    },
  });
  if (!card || card.ownerId !== user.id) {
    throw new GameError("not-owner", "Akira only burns cards that belong to you.");
  }
  if (await cardInOpenTransfer(card.id)) {
    throw new GameError("busy", "That card is in an open trade.");
  }

  const imagePath = await ensureCardImage({
    variantId: card.variant.id,
    seriesSlug: card.variant.character.series.slug,
    characterSlug: card.variant.character.slug,
    imageFile: card.variant.image,
    characterName: card.variant.character.name,
    seriesName: card.variant.character.series.name,
    frameId: displayFrameId(card.frameId, await serverDefaultFrame(guildId), card.owner?.defaultFrameId ?? null),
    printNumber: card.printNumber,
    dye: card.dye,
    kind: "burn",
  });

  const settled = await burnOwnedCards(discordId, username, [card.id], guildId);
  return {
    awarded: settled.awarded,
    balance: settled.balance,
    imagePath,
    characterName: card.variant.character.name,
    printNumber: card.printNumber,
    quality: card.quality,
  };
}
