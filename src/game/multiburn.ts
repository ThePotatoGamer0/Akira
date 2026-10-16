import { prisma } from "../db/client.js";
import { burnPayout, QUALITIES, type Quality } from "./balance.js";
import { qualityStars } from "./display.js";
import { GameError } from "./errors.js";
import { assertTagName } from "./tags.js";
import { cardsHeldInOpenTransfers } from "./transfer.js";
import { ensureUser, findUserByDiscordId } from "./users.js";

export type TaggedBurnCard = {
  id: string;
  quality: Quality;
  characterName: string;
};

export type TaggedBurnPlan = {
  tagName: string;
  emoji: string;
  cards: TaggedBurnCard[];
  held: number;
};

const RANK: Record<Quality, number> = {
  COMMON: 0,
  UNCOMMON: 1,
  RARE: 2,
  EPIC: 3,
  LEGENDARY: 4,
};

function asQuality(quality: string): Quality {
  return (QUALITIES as readonly string[]).includes(quality) ? (quality as Quality) : "COMMON";
}

async function busyCardIds(cardIds: string[]): Promise<Set<string>> {
  return cardsHeldInOpenTransfers(cardIds);
}

export function rarestCards(cards: readonly TaggedBurnCard[]): TaggedBurnCard[] {
  let best = -1;
  for (const card of cards) best = Math.max(best, RANK[card.quality]);
  return cards.filter((card) => RANK[card.quality] === best);
}

export function multiburnConfirmText(plan: TaggedBurnPlan): string {
  const count = plan.cards.length;
  const cardWord = count === 1 ? "card" : "cards";
  const lines = [
    `Burning **${count}** ${cardWord} tagged ${plan.emoji} **${plan.tagName}**.`,
    rarestSentence(plan.cards),
  ];
  if (plan.held > 0) {
    const stays = plan.held === 1 ? "card stays" : "cards stay";
    const pronoun = plan.held === 1 ? "It's" : "They're";
    lines.push(`**${plan.held}** ${stays} put. ${pronoun} in an open trade.`);
  }
  return lines.join("\n");
}

function rarestSentence(cards: readonly TaggedBurnCard[]): string {
  const top = rarestCards(cards);
  const stars = qualityStars(top[0]!.quality);
  const names = [...new Set(top.map((card) => card.characterName))];
  const shown = names.slice(0, 3).map((name) => `**${name}**`);
  const extra = names.length - 3;
  if (names.length === 1) return `The rarest is ${stars} ${shown[0]}.`;
  if (extra > 0) return `The rarest are ${stars} ${shown.join(", ")}, and ${extra} more.`;
  if (shown.length === 2) return `The rarest are ${stars} ${shown[0]} and ${shown[1]}.`;
  return `The rarest are ${stars} ${shown[0]}, ${shown[1]}, and ${shown[2]}.`;
}

export async function planTaggedBurn(discordId: string, rawName: string): Promise<TaggedBurnPlan> {
  const name = assertTagName(rawName);
  const user = await findUserByDiscordId(discordId);
  if (!user) throw new GameError("missing", `You don't have a tag named **${name}**.`);
  const tag = await prisma.tag.findUnique({ where: { userId_name: { userId: user.id, name } } });
  if (!tag) throw new GameError("missing", `You don't have a tag named **${name}**.`);
  const owned = await prisma.card.findMany({
    where: { ownerId: user.id, tag: name },
    include: { variant: { include: { character: true } } },
  });
  if (owned.length === 0) throw new GameError("empty", `None of your cards have the **${name}** tag.`);
  const busy = await busyCardIds(owned.map((card) => card.id));
  const cards = owned
    .filter((card) => !busy.has(card.id))
    .map((card) => ({
      id: card.id,
      quality: asQuality(card.quality),
      characterName: card.variant.character.name,
    }));
  if (cards.length === 0) throw new GameError("busy", "Those cards are in an open trade.");
  return { tagName: tag.name, emoji: tag.emoji, cards, held: owned.length - cards.length };
}

export async function burnTaggedCards(
  discordId: string,
  username: string,
  rawName: string,
  cardIds: string[],
): Promise<{ burned: number; awarded: number; balance: number; skipped: number; emoji: string; tagName: string }> {
  const name = assertTagName(rawName);
  const user = await ensureUser(discordId, username);
  const tag = await prisma.tag.findUnique({ where: { userId_name: { userId: user.id, name } } });
  if (!tag) throw new GameError("missing", `You don't have a tag named **${name}**.`);
  const ids = [...new Set(cardIds)];
  const owned = await prisma.card.findMany({ where: { id: { in: ids }, ownerId: user.id, tag: name } });
  const busy = await busyCardIds(owned.map((card) => card.id));
  const burning = owned.filter((card) => !busy.has(card.id));
  if (burning.length === 0) {
    if (owned.length > 0) throw new GameError("busy", "Those cards are in an open trade.");
    throw new GameError("empty", "Those cards aren't yours to burn anymore.");
  }
  const awarded = burning.reduce((sum, card) => sum + burnPayout(card.quality), 0);
  const burnIds = burning.map((card) => card.id);
  const updated = await prisma.$transaction(async (tx) => {
    await tx.card.deleteMany({ where: { id: { in: burnIds }, ownerId: user.id } });
    const current = await tx.user.findUnique({ where: { id: user.id } });
    const clearGrab = current?.lastGrabbedCardId != null && burnIds.includes(current.lastGrabbedCardId);
    return tx.user.update({
      where: { id: user.id },
      data: {
        bits: { increment: awarded },
        ...(clearGrab ? { lastGrabbedCardId: null } : {}),
      },
    });
  });
  return {
    burned: burning.length,
    awarded,
    balance: updated.bits,
    skipped: ids.length - burning.length,
    emoji: tag.emoji,
    tagName: tag.name,
  };
}
