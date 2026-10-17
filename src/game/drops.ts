import fs from "node:fs";
import type { CardQuality } from "../generated/prisma/client.js";
import { prisma } from "../db/client.js";
import { loadFrame } from "../utils/frames.js";
import { variantArtPath } from "../utils/paths.js";
import { displayFrameId, serverDefaultFrame } from "./frames.js";
import {
  claimFailureMessage,
  decideClaim,
  DROP_COOLDOWN_MS,
  DROP_OPEN_MS,
  formatRemaining,
  GRAB_BITS,
  issuePrint,
  nextPity,
  rollArts,
  rollQuality,
  type Quality,
} from "./balance.js";
import { dropWeight, includeInDrop } from "./buffs.js";
import { mintCardCode } from "./codes.js";
import { GameError } from "./errors.js";
import { activeEffects } from "./live-buffs.js";
import { ensureUser } from "./users.js";

const variantInclude = {
  character: { include: { series: true } },
} as const;

export type PresentedSlot = {
  position: number;
  quality: Quality;
  frameId: number;
  variantId: string;
  variantName: string;
  rarity: string;
  imageFile: string;
  characterId: string;
  characterName: string;
  characterSlug: string;
  seriesSlug: string;
  seriesName: string;
  claimedByDiscordId: string | null;
  printNumber: number | null;
};

export type PreparedDrop = {
  guildId: string;
  channelId: string;
  userId: string;
  dropperDiscordId: string;
  dropCooldownMs: number;
  expiresAt: Date;
  slots: PresentedSlot[];
  wishlistDiscordIds: string[];
  dropsSinceMint: number;
};

export type DropPresentation = PreparedDrop & { messageId: string };

type VariantRow = {
  id: string;
  name: string;
  rarity: string;
  image: string;
  character: {
    id: string;
    name: string;
    slug: string;
    role: string | null;
    seriesId: string;
    series: { slug: string; name: string };
  };
};

function slotFromVariant(position: number, variant: VariantRow, quality: Quality, frameId: number): PresentedSlot {
  return {
    position,
    quality,
    frameId,
    variantId: variant.id,
    variantName: variant.name,
    rarity: variant.rarity,
    imageFile: variant.image,
    characterId: variant.character.id,
    characterName: variant.character.name,
    characterSlug: variant.character.slug,
    seriesSlug: variant.character.series.slug,
    seriesName: variant.character.series.name,
    claimedByDiscordId: null,
    printNumber: null,
  };
}

async function drawableVariants(): Promise<VariantRow[]> {
  const variants = await prisma.cardVariant.findMany({ include: variantInclude });
  return variants.filter((variant) =>
    fs.existsSync(variantArtPath(variant.character.series.slug, variant.character.slug, variant.image)),
  );
}

export async function resolveDropChannelId(guildId: string): Promise<string | null> {
  const row = await prisma.guildConfig.findUnique({ where: { guildId } });
  if (row?.dropChannelId) return row.dropChannelId;
  const envGuild = process.env["DISCORD_GUILD_ID"];
  const envChannel = process.env["DISCORD_DROP_CHANNEL_ID"];
  if (envGuild && envChannel && envGuild === guildId) return envChannel;
  return null;
}

/** A server is quiet until this is true. The env drop channel counts for the configured server. */
export async function serverHasDropChannel(guildId: string): Promise<boolean> {
  return (await resolveDropChannelId(guildId)) !== null;
}

export async function setDropChannel(guildId: string, channelId: string): Promise<void> {
  await prisma.guildConfig.upsert({
    where: { guildId },
    create: { guildId, dropChannelId: channelId },
    update: { dropChannelId: channelId },
  });
}

async function cooldownRemaining(userId: string, type: "DROP" | "GRAB" | "DAILY"): Promise<number> {
  const row = await prisma.cooldown.findUnique({
    where: { userId_type: { userId, type } },
  });
  if (!row) return 0;
  return Math.max(0, row.expiresAt.getTime() - Date.now());
}

async function wishlistDiscordIds(characterIds: string[]): Promise<string[]> {
  if (characterIds.length === 0) return [];
  const rows = await prisma.wishlist.findMany({
    where: { characterId: { in: characterIds } },
    include: { user: true },
  });
  return [...new Set(rows.map((row) => row.user.discordId))];
}

export async function prepareDrop(input: {
  guildId: string;
  channelId: string;
  discordId: string;
  username: string;
  rng?: () => number;
}): Promise<PreparedDrop> {
  const channelId = await resolveDropChannelId(input.guildId);
  if (!channelId) {
    throw new GameError(
      "no-channel",
      "Akira doesn't have a drop channel in this server yet.",
    );
  }
  if (channelId !== input.channelId) {
    throw new GameError("wrong-channel", "Akira only drops cards in the drop channel.");
  }
  const frameId = await serverDefaultFrame(input.guildId);
  if (!loadFrame(frameId)) {
    throw new GameError("missing-frame", "Akira is missing the default frame in input/frames/0.");
  }

  const user = await ensureUser(input.discordId, input.username);
  const wait = await cooldownRemaining(user.id, "DROP");
  if (wait > 0) {
    throw new GameError("cooldown", `Akira needs you to wait ${formatRemaining(wait)} before dropping again.`);
  }

  const variants = await drawableVariants();
  if (variants.length === 0) {
    throw new GameError("empty", "Akira doesn't have any card art to drop yet.");
  }

  const effects = await activeEffects(user.id, input.guildId);
  const rng = input.rng ?? Math.random;
  const pool = variants.filter((variant) => includeInDrop(variant.character.role, effects.qualityOverQuantity));
  if (pool.length === 0) {
    throw new GameError(
      "empty",
      effects.qualityOverQuantity
        ? "Akira doesn't have any main characters to drop yet."
        : "Akira doesn't have any card art to drop yet.",
    );
  }
  const rolled = rollArts(pool, rng, effects.cardCount, (variant) =>
    dropWeight({
      variantId: variant.id,
      rarity: variant.rarity,
      seriesId: variant.character.seriesId,
      role: variant.character.role,
      effects,
    }),
  );
  const pitied = nextPity({
    dropsSinceMint: user.dropsSinceMint,
    qualities: rolled.map(() => rollQuality(rng, effects.legendaryWeight)),
    rng,
  });
  const slots = rolled.map((variant, index) =>
    slotFromVariant(index + 1, variant, pitied.qualities[index] ?? "COMMON", frameId),
  );
  const wishes = await wishlistDiscordIds(slots.map((slot) => slot.characterId));

  return {
    guildId: input.guildId,
    channelId: input.channelId,
    userId: user.id,
    dropperDiscordId: input.discordId,
    dropCooldownMs: effects.dropCooldownMs,
    expiresAt: new Date(Date.now() + DROP_OPEN_MS),
    slots,
    wishlistDiscordIds: wishes.filter((id) => id !== input.discordId),
    dropsSinceMint: pitied.dropsSinceMint,
  };
}

export async function commitDrop(prepared: PreparedDrop, messageId: string): Promise<void> {
  const expiresAt = new Date(Date.now() + prepared.dropCooldownMs);
  await prisma.$transaction(async (tx) => {
    const existing = await tx.cooldown.findUnique({
      where: { userId_type: { userId: prepared.userId, type: "DROP" } },
    });
    if (existing && existing.expiresAt.getTime() > Date.now()) {
      throw new GameError(
        "cooldown",
        `Akira needs you to wait ${formatRemaining(existing.expiresAt.getTime() - Date.now())} before dropping again.`,
      );
    }

    await tx.drop.create({
      data: {
        guildId: prepared.guildId,
        channelId: prepared.channelId,
        messageId,
        expiresAt: prepared.expiresAt,
        dropperId: prepared.userId,
        slots: {
          create: prepared.slots.map((slot) => ({
            position: slot.position,
            variantId: slot.variantId,
            quality: slot.quality as CardQuality,
            frameId: null,
          })),
        },
      },
    });

    await tx.cooldown.upsert({
      where: { userId_type: { userId: prepared.userId, type: "DROP" } },
      create: { userId: prepared.userId, type: "DROP", expiresAt },
      update: { expiresAt },
    });
    await tx.user.update({
      where: { id: prepared.userId },
      data: { dropsSinceMint: prepared.dropsSinceMint },
    });
  });
}

type DropWithSlots = {
  messageId: string;
  guildId: string;
  channelId: string;
  expiresAt: Date;
  slots: Array<{
    position: number;
    quality: CardQuality;
    frameId: number | null;
    variantId: string;
    claimedBy: { discordId: string } | null;
    card: { printNumber: number } | null;
    variant: VariantRow;
  }>;
};

function present(drop: DropWithSlots, wishlistIds: string[], serverFrame: number): DropPresentation {
  return {
    messageId: drop.messageId,
    guildId: drop.guildId,
    channelId: drop.channelId,
    userId: "",
    dropperDiscordId: "",
    dropCooldownMs: DROP_COOLDOWN_MS,
    expiresAt: drop.expiresAt,
    wishlistDiscordIds: wishlistIds,
    dropsSinceMint: 0,
    slots: drop.slots
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((slot) => ({
        position: slot.position,
        quality: slot.quality,
        frameId: displayFrameId(slot.frameId, serverFrame),
        variantId: slot.variant.id,
        variantName: slot.variant.name,
        rarity: slot.variant.rarity,
        imageFile: slot.variant.image,
        characterId: slot.variant.character.id,
        characterName: slot.variant.character.name,
        characterSlug: slot.variant.character.slug,
        seriesSlug: slot.variant.character.series.slug,
        seriesName: slot.variant.character.series.name,
        claimedByDiscordId: slot.claimedBy?.discordId ?? null,
        printNumber: slot.card?.printNumber ?? null,
      })),
  };
}

const dropInclude = {
  slots: {
    include: {
      claimedBy: true,
      card: true,
      variant: { include: variantInclude },
    },
  },
} as const;

export async function loadDrop(messageId: string): Promise<DropPresentation | null> {
  const drop = await prisma.drop.findUnique({
    where: { messageId },
    include: dropInclude,
  });
  if (!drop) return null;
  const wishes = await wishlistDiscordIds(drop.slots.map((slot) => slot.variant.character.id));
  const serverFrame = await serverDefaultFrame(drop.guildId);
  return present(drop, wishes, serverFrame);
}

export type ClaimResult = {
  cardId: string;
  printNumber: number;
  quality: Quality;
  characterName: string;
  bits: number;
  /** Discord id of the player who grabbed first, when the dropper took the card back. */
  foughtOffDiscordId: string | null;
  presentation: DropPresentation;
};

export async function claimReaction(input: {
  messageId: string;
  position: number;
  discordId: string;
  username: string;
}): Promise<ClaimResult> {
  const user = await ensureUser(input.discordId, input.username);
  const dropGuild = await prisma.drop.findUnique({
    where: { messageId: input.messageId },
    select: { guildId: true },
  });
  const grabMs = (await activeEffects(user.id, dropGuild?.guildId ?? null)).grabCooldownMs;

  const claimed = await prisma.$transaction(async (tx) => {
    const drop = await tx.drop.findUnique({
      where: { messageId: input.messageId },
      include: { slots: { include: { claimedBy: true, card: true } } },
    });
    if (!drop) {
      throw new GameError("missing", "Akira couldn't find that drop.");
    }
    const slot = drop.slots.find((row) => row.position === input.position);
    if (!slot) {
      throw new GameError("bad-slot", "Akira doesn't have a card in that spot.");
    }

    const grab = await tx.cooldown.findUnique({
      where: { userId_type: { userId: user.id, type: "GRAB" } },
    });
    const decision = decideClaim({
      now: Date.now(),
      expiresAt: drop.expiresAt.getTime(),
      dropCreatedAt: drop.createdAt.getTime(),
      slotClaimed: slot.claimedById !== null,
      claimerIsDropper: drop.dropperId !== null && drop.dropperId === user.id,
      claimedByDropper: drop.dropperId !== null && slot.claimedById === drop.dropperId,
      grabReadyAt: grab ? grab.expiresAt.getTime() : null,
    });
    if (!decision.ok) {
      const remaining = grab ? Math.max(0, grab.expiresAt.getTime() - Date.now()) : 0;
      throw new GameError(decision.reason, claimFailureMessage(decision.reason, remaining));
    }

    if (decision.foughtOff) {
      const sniper = slot.claimedBy;
      const card = slot.card;
      if (!sniper || !card) {
        throw new GameError("taken", claimFailureMessage("taken", 0));
      }
      const moved = await tx.dropSlot.updateMany({
        where: { id: slot.id, claimedById: sniper.id },
        data: { claimedById: user.id },
      });
      if (moved.count !== 1) {
        throw new GameError("taken", claimFailureMessage("taken", 0));
      }
      await tx.card.update({
        where: { id: card.id },
        data: { ownerId: user.id },
      });
      const sniperRow = await tx.user.findUnique({ where: { id: sniper.id } });
      await tx.user.update({
        where: { id: sniper.id },
        data: {
          bits: Math.max(0, (sniperRow?.bits ?? 0) - GRAB_BITS),
          lastGrabbedCardId: sniperRow?.lastGrabbedCardId === card.id ? null : (sniperRow?.lastGrabbedCardId ?? null),
        },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { bits: { increment: GRAB_BITS } },
      });
      const grabExpires = new Date(Date.now() + grabMs);
      await tx.cooldown.upsert({
        where: { userId_type: { userId: user.id, type: "GRAB" } },
        create: { userId: user.id, type: "GRAB", expiresAt: grabExpires },
        update: { expiresAt: grabExpires },
      });
      return {
        cardId: card.id,
        printNumber: card.printNumber,
        quality: slot.quality,
        foughtOffDiscordId: sniper.discordId,
      };
    }

    const taken = await tx.dropSlot.updateMany({
      where: { id: slot.id, claimedById: null },
      data: { claimedById: user.id },
    });
    if (taken.count !== 1) {
      throw new GameError("taken", claimFailureMessage("taken", 0));
    }

    await tx.printCounter.upsert({
      where: { variantId: slot.variantId },
      create: { variantId: slot.variantId, nextPrint: 1 },
      update: {},
    });
    const counter = await tx.printCounter.update({
      where: { variantId: slot.variantId },
      data: { nextPrint: { increment: 1 } },
    });
    const printed = issuePrint(counter.nextPrint - 1);

    const cardId = await mintCardCode(async (id) => {
      const existing = await tx.card.findUnique({ where: { id }, select: { id: true } });
      return existing !== null;
    });
    const card = await tx.card.create({
      data: {
        id: cardId,
        variantId: slot.variantId,
        frameId: slot.frameId,
        printNumber: printed.printNumber,
        quality: slot.quality,
        ownerId: user.id,
      },
    });
    await tx.dropSlot.update({
      where: { id: slot.id },
      data: { cardId: card.id },
    });
    await tx.user.update({
      where: { id: user.id },
      data: { bits: { increment: GRAB_BITS } },
    });
    const grabExpires = new Date(Date.now() + grabMs);
    await tx.cooldown.upsert({
      where: { userId_type: { userId: user.id, type: "GRAB" } },
      create: { userId: user.id, type: "GRAB", expiresAt: grabExpires },
      update: { expiresAt: grabExpires },
    });

    return {
      cardId: card.id,
      printNumber: printed.printNumber,
      quality: slot.quality,
      foughtOffDiscordId: null,
    };
  });

  const presentation = await loadDrop(input.messageId);
  if (!presentation) {
    throw new GameError("missing", "Akira claimed the card, but the drop disappeared.");
  }
  const slot = presentation.slots.find((row) => row.position === input.position);
  return {
    ...claimed,
    characterName: slot?.characterName ?? "that card",
    bits: GRAB_BITS,
    presentation,
  };
}

export async function dropsAwaitingExpiry(): Promise<Array<{ messageId: string; channelId: string; expiresAt: Date }>> {
  return prisma.drop.findMany({
    where: { expiryPosted: false },
    select: { messageId: true, channelId: true, expiresAt: true },
  });
}

export async function markDropExpired(messageId: string): Promise<void> {
  await prisma.drop.updateMany({
    where: { messageId, expiryPosted: false },
    data: { expiryPosted: true },
  });
}
