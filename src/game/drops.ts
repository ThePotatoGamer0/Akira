import fs from "node:fs";
import type { CardQuality } from "../generated/prisma/client.js";
import type { TransactionClient } from "../generated/prisma/internal/prismaNamespace.js";
import { prisma } from "../db/client.js";
import { loadFrame } from "../utils/frames.js";
import { variantArtPath } from "../utils/paths.js";
import { displayFrameId, serverDefaultFrame } from "./frames.js";
import {
  claimFailureMessage,
  decideClaim,
  DROP_COOLDOWN_MS,
  DROP_OPEN_MS,
  DROP_PROTECTION_MS,
  formatRemaining,
  GRAB_BITS,
  issuePrint,
  nextPity,
  rollQuality,
  type Quality,
} from "./balance.js";
import { includeInDrop, rollDropArts, type ResolvedEffects } from "./buffs.js";
import { clearWishlistOnObtain } from "./cards.js";
import { mintCardCode } from "./codes.js";
import { dropShape, pityKeepsQualities } from "./drop-stock.js";
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

export type WishlistWatcher = { discordId: string; names: string[] };

export type PreparedDrop = {
  guildId: string;
  channelId: string;
  userId: string;
  dropperDiscordId: string;
  dropCooldownMs: number;
  expiresAt: Date;
  slots: PresentedSlot[];
  wishlistWatchers: WishlistWatcher[];
  dropsSinceMint: number;
  fromShelf: boolean;
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

async function wishlistWatchersForSlots(
  slots: PresentedSlot[],
  exceptDiscordId?: string,
): Promise<WishlistWatcher[]> {
  const slotsById = new Map(slots.map((slot) => [slot.characterId, slot]));
  if (slotsById.size === 0) return [];
  const rows = await prisma.wishlist.findMany({
    where: { characterId: { in: [...slotsById.keys()] } },
    select: { characterId: true, user: { select: { discordId: true } } },
  });
  const byUser = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.user.discordId === exceptDiscordId) continue;
    if (!slotsById.has(row.characterId)) continue;
    const ids = byUser.get(row.user.discordId) ?? new Set<string>();
    ids.add(row.characterId);
    byUser.set(row.user.discordId, ids);
  }
  return [...byUser.entries()].map(([discordId, ids]) => ({
    discordId,
    names: [...ids].map((id) => slotsById.get(id)?.characterName ?? "").filter(Boolean),
  }));
}

export type WishlistHeadsUp = {
  discordId: string;
  names: string[];
  /** Discord id of whoever grabbed each character, aligned with `names`. Null while it is still open. */
  grabbedBy: Array<string | null>;
};

/**
 * Watchers of characters in this drop who could still grab one. Read after
 * snipe protection ends so the DM can say who beat them to it.
 */
export async function wishlistHeadsUps(
  messageId: string,
  exceptDiscordId?: string,
): Promise<WishlistHeadsUp[]> {
  const drop = await prisma.drop.findUnique({
    where: { messageId },
    select: {
      dropperId: true,
      slots: {
        select: {
          claimedBy: { select: { discordId: true } },
          variant: { select: { characterId: true } },
        },
      },
    },
  });
  if (!drop || drop.slots.length === 0) return [];
  const firstGrab = new Map<string, string | null>();
  for (const slot of drop.slots) {
    const characterId = slot.variant.characterId;
    if (!firstGrab.has(characterId)) firstGrab.set(characterId, slot.claimedBy?.discordId ?? null);
  }
  const rows = await prisma.wishlist.findMany({
    where: { characterId: { in: [...firstGrab.keys()] } },
    select: {
      characterId: true,
      character: { select: { name: true } },
      user: { select: { id: true, discordId: true } },
    },
  });
  const held = new Map<string, string[]>();
  if (drop.dropperId) {
    const cards = await prisma.card.findMany({
      where: { ownerId: drop.dropperId, variant: { characterId: { in: [...firstGrab.keys()] } } },
      select: { variant: { select: { characterId: true } } },
    });
    for (const card of cards) {
      const list = held.get(card.variant.characterId) ?? [];
      list.push(drop.dropperId);
      held.set(card.variant.characterId, list);
    }
  }
  const excluded = new Set([drop.dropperId, exceptDiscordId].filter((id): id is string => Boolean(id)));
  const byUser = new Map<string, { names: string[]; grabbedBy: Array<string | null> }>();
  for (const row of rows) {
    if (excluded.has(row.user.id)) continue;
    if (held.has(row.characterId)) continue;
    const entry = byUser.get(row.user.discordId) ?? { names: [], grabbedBy: [] };
    entry.names.push(row.character.name);
    entry.grabbedBy.push(firstGrab.get(row.characterId) ?? null);
    byUser.set(row.user.discordId, entry);
  }
  return [...byUser.entries()].map(([discordId, entry]) => ({ discordId, ...entry }));
}

export async function rollFreshSlots(
  effects: ResolvedEffects,
  frameId: number,
  rng: () => number = Math.random,
): Promise<PresentedSlot[]> {
  const variants = await drawableVariants();
  if (variants.length === 0) {
    throw new GameError("empty", "Akira doesn't have any card art to drop yet.");
  }
  const pool = variants.filter((variant) => includeInDrop(variant.character.role, effects.qualityOverQuantity));
  if (pool.length === 0) {
    throw new GameError(
      "empty",
      effects.qualityOverQuantity
        ? "Akira doesn't have any main characters to drop yet."
        : "Akira doesn't have any card art to drop yet.",
    );
  }
  const rolled = rollDropArts(
    pool.map((variant) => ({
      variant,
      id: variant.id,
      rarity: variant.rarity,
      seriesId: variant.character.seriesId,
      role: variant.character.role,
    })),
    rng,
    effects.cardCount,
    effects,
  ).map((row) => row.variant);
  const qualities = rolled.map(() => rollQuality(rng, effects.legendaryWeight));
  return rolled.map((variant, index) =>
    slotFromVariant(index + 1, variant, qualities[index] ?? "COMMON", frameId),
  );
}

export async function prepareDrop(input: {
  guildId: string;
  channelId: string;
  discordId: string;
  username: string;
  rng?: () => number;
  presetSlots?: PresentedSlot[] | null;
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

  const effects = await activeEffects(user.id, input.guildId);
  const rng = input.rng ?? Math.random;
  const rolled = await rolledSlots(effects, frameId, user.dropsSinceMint, rng, input.presetSlots ?? null);
  const watchers = await wishlistWatchersForSlots(rolled.slots, input.discordId);
  await claimDropCooldown(user.id, effects.dropCooldownMs);

  return {
    guildId: input.guildId,
    channelId: input.channelId,
    userId: user.id,
    dropperDiscordId: input.discordId,
    dropCooldownMs: effects.dropCooldownMs,
    expiresAt: new Date(Date.now() + DROP_OPEN_MS),
    slots: rolled.slots,
    wishlistWatchers: watchers,
    dropsSinceMint: rolled.dropsSinceMint,
    fromShelf: rolled.fromShelf,
  };
}

async function rolledSlots(
  effects: ResolvedEffects,
  frameId: number,
  dropsSinceMint: number,
  rng: () => number,
  preset: PresentedSlot[] | null,
): Promise<{ slots: PresentedSlot[]; dropsSinceMint: number; fromShelf: boolean }> {
  const shape = dropShape(effects, frameId);
  const presetOk =
    preset !== null &&
    shape !== null &&
    preset.length === effects.cardCount &&
    preset.every((slot) => slot.frameId === frameId) &&
    pityKeepsQualities(
      dropsSinceMint,
      preset.map((slot) => slot.quality),
    );
  if (presetOk && preset) {
    const pitied = nextPity({
      dropsSinceMint,
      qualities: preset.map((slot) => slot.quality),
      rng,
    });
    const unchanged = pitied.qualities.every((quality, index) => quality === preset[index]?.quality);
    if (unchanged) {
      return {
        slots: preset.map((slot) => ({ ...slot })),
        dropsSinceMint: pitied.dropsSinceMint,
        fromShelf: true,
      };
    }
  }
  const fresh = await rollFreshSlots(effects, frameId, rng);
  const pitied = nextPity({
    dropsSinceMint,
    qualities: fresh.map((slot) => slot.quality),
    rng,
  });
  return {
    slots: fresh.map((slot, index) => ({ ...slot, quality: pitied.qualities[index] ?? slot.quality })),
    dropsSinceMint: pitied.dropsSinceMint,
    fromShelf: false,
  };
}

async function claimDropCooldown(userId: string, dropCooldownMs: number): Promise<void> {
  const expiresAt = new Date(Date.now() + dropCooldownMs);
  await prisma.$transaction(async (tx) => {
    const existing = await tx.cooldown.findUnique({
      where: { userId_type: { userId, type: "DROP" } },
    });
    if (existing && existing.expiresAt.getTime() > Date.now()) {
      throw new GameError(
        "cooldown",
        `Akira needs you to wait ${formatRemaining(existing.expiresAt.getTime() - Date.now())} before dropping again.`,
      );
    }
    await tx.cooldown.upsert({
      where: { userId_type: { userId, type: "DROP" } },
      create: { userId, type: "DROP", expiresAt },
      update: { expiresAt },
    });
  });
}

/** Drop the cooldown when the card image never went up, so the player can try again. */
export async function releaseDropCooldown(userId: string): Promise<void> {
  await prisma.cooldown.deleteMany({ where: { userId, type: "DROP" } });
}

export async function commitDrop(prepared: PreparedDrop, messageId: string): Promise<Date> {
  const expiresAt = new Date(Date.now() + prepared.dropCooldownMs);
  return prisma.$transaction(async (tx) => {
    const created = await tx.drop.create({
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
    return created.createdAt;
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

function present(drop: DropWithSlots, serverFrame: number): DropPresentation {
  return {
    messageId: drop.messageId,
    guildId: drop.guildId,
    channelId: drop.channelId,
    userId: "",
    dropperDiscordId: "",
    dropCooldownMs: DROP_COOLDOWN_MS,
    expiresAt: drop.expiresAt,
    wishlistWatchers: [],
    dropsSinceMint: 0,
    fromShelf: false,
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
  const serverFrame = await serverDefaultFrame(drop.guildId);
  return present(drop, serverFrame);
}

export type GrabNotice = {
  discordId: string;
  /** Set when this line is the dropper taking the card back. */
  foughtOffDiscordId: string | null;
  characterName: string;
  cardId: string;
  quality: string;
};

export type ClaimResult = {
  cardId: string;
  printNumber: number;
  quality: Quality;
  characterName: string;
  bits: number;
  /** Discord id of the player who grabbed first, when the dropper took the card back. */
  foughtOffDiscordId: string | null;
  /** Grab lines to post now. Empty while snipe protection is still holding this drop. */
  notices: GrabNotice[];
  presentation: DropPresentation;
  /** Characters that were on this player's wishlist and are now off it. */
  wishlistCleared: string[];
};

const noticeInclude = {
  claimedBy: true,
  card: true,
  variant: { include: { character: true } },
} as const;

async function markHeldGrabs(
  tx: TransactionClient,
  dropId: string,
  foughtOffSlotId: string | null,
  foughtOffDiscordId: string | null,
): Promise<GrabNotice[]> {
  const pending = await tx.dropSlot.findMany({
    where: { dropId, announced: false, claimedById: { not: null } },
    include: noticeInclude,
    orderBy: { position: "asc" },
  });
  const notices: GrabNotice[] = [];
  for (const row of pending) {
    const flipped = await tx.dropSlot.updateMany({
      where: { id: row.id, announced: false },
      data: { announced: true },
    });
    if (flipped.count !== 1 || !row.claimedBy || !row.card) continue;
    notices.push({
      discordId: row.claimedBy.discordId,
      foughtOffDiscordId: row.id === foughtOffSlotId ? foughtOffDiscordId : null,
      characterName: row.variant.character.name,
      cardId: row.card.id,
      quality: row.quality,
    });
  }
  return notices;
}

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

    let cardId = "";
    let printNumber = 0;
    let foughtOffDiscordId: string | null = null;

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
      await tx.cooldown.deleteMany({
        where: { userId: sniper.id, type: "GRAB" },
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
      cardId = card.id;
      printNumber = card.printNumber;
      foughtOffDiscordId = sniper.discordId;
    } else {
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

      cardId = await mintCardCode(async (id) => {
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
      printNumber = printed.printNumber;
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
    }

    const protectionOver = Date.now() >= drop.createdAt.getTime() + DROP_PROTECTION_MS;
    const dropperAlreadyClaimed =
      drop.dropperId !== null && drop.slots.some((row) => row.id !== slot.id && row.claimedById === drop.dropperId);
    const release = protectionOver || dropperAlreadyClaimed || (drop.dropperId !== null && drop.dropperId === user.id);
    const notices = release ? await markHeldGrabs(tx, drop.id, foughtOffDiscordId ? slot.id : null, foughtOffDiscordId) : [];

    return {
      cardId,
      printNumber,
      quality: slot.quality,
      foughtOffDiscordId,
      notices,
    };
  });

  const presentation = await loadDrop(input.messageId);
  if (!presentation) {
    throw new GameError("missing", "Akira claimed the card, but the drop disappeared.");
  }
  const slot = presentation.slots.find((row) => row.position === input.position);
  const cleared = await clearWishlistOnObtain(user.id, slot ? [slot.characterId] : []);
  return {
    ...claimed,
    characterName: slot?.characterName ?? "that card",
    bits: GRAB_BITS,
    presentation,
    wishlistCleared: cleared,
  };
}

export async function dropsNeedingGrabRelease(now = Date.now()): Promise<Array<{ messageId: string; channelId: string; createdAt: Date }>> {
  const since = new Date(now - DROP_PROTECTION_MS);
  return prisma.drop.findMany({
    where: {
      OR: [
        { createdAt: { gt: since } },
        { slots: { some: { announced: false, claimedById: { not: null } } } },
      ],
    },
    select: { messageId: true, channelId: true, createdAt: true },
  });
}

/** Post grab lines once snipe protection has ended. */
export async function releaseHeldGrabs(
  now = Date.now(),
  messageId?: string,
): Promise<Array<{ messageId: string; channelId: string; notices: GrabNotice[] }>> {
  const cutoff = new Date(now - DROP_PROTECTION_MS);
  const drops = await prisma.drop.findMany({
    where: {
      ...(messageId ? { messageId } : {}),
      createdAt: { lte: cutoff },
      slots: { some: { announced: false, claimedById: { not: null } } },
    },
    select: { id: true, messageId: true, channelId: true },
  });
  const released: Array<{ messageId: string; channelId: string; notices: GrabNotice[] }> = [];
  for (const drop of drops) {
    const notices = await prisma.$transaction((tx) => markHeldGrabs(tx, drop.id, null, null));
    if (notices.length > 0) released.push({ messageId: drop.messageId, channelId: drop.channelId, notices });
  }
  return released;
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
