import { prisma } from "../db/client.js";
import { burnPayout, DAILY_COOLDOWN_MS, dailyPayout, formatRemaining, type Quality } from "./balance.js";
import { activeEffects } from "./live-buffs.js";
import { ensureCardImage } from "./compose.js";
import { displayFrameId, serverDefaultFrame } from "./frames.js";
import { GameError } from "./errors.js";
import { cardInOpenTransfer } from "./transfer.js";
import { ensureUser } from "./users.js";

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
    frameId: displayFrameId(card.frameId, await serverDefaultFrame(guildId)),
    printNumber: card.printNumber,
    dye: card.dye,
    kind: "burn",
  });

  const awarded = Math.round(burnPayout(card.quality) * (await activeEffects(user.id, guildId)).burnMultiplier);
  const updated = await prisma.$transaction(async (tx) => {
    await tx.card.delete({ where: { id: card.id } });
    return tx.user.update({
      where: { id: user.id },
      data: { bits: { increment: awarded } },
    });
  });

  return {
    awarded,
    balance: updated.bits,
    imagePath,
    characterName: card.variant.character.name,
    printNumber: card.printNumber,
    quality: card.quality,
  };
}
