import { prisma } from "../db/client.js";
import { akiraAddressName } from "../utils/akira-address-name.js";
import { discordAvatarUrl } from "../utils/discord-avatar.js";
import { isCardCode, mintCardCode } from "./codes.js";
import { editionNumber } from "./editions.js";
import { GameError } from "./errors.js";
import { applyCardFilters, type CardFilter } from "./filters.js";
import { rankCharacters } from "./search-records.js";
import { parseQuery } from "./search.js";
import { ensureUser, findUserByDiscordId, rememberDiscordAvatars } from "./users.js";

export const COLLECTION_PAGE_SIZE = 10;

const cardInclude = {
  variant: {
    include: {
      character: { include: { series: true } },
    },
  },
  owner: true,
} as const;

const collectionInclude = {
  variant: {
    include: {
      character: {
        include: {
          series: true,
          variants: { select: { id: true, name: true } },
          _count: { select: { wishlists: true } },
        },
      },
    },
  },
  owner: true,
} as const;

export async function listCollection(discordId: string, page = 0, filter: CardFilter = {}) {
  const user = await findUserByDiscordId(discordId);
  if (!user) return { total: 0, cards: [], page: 0, owned: 0 };
  const ownedCards = await prisma.card.findMany({
    where: { ownerId: user.id },
    include: collectionInclude,
  });
  const filtered = applyCardFilters(
    ownedCards.map((card) => ({
      ...card,
      edition: editionNumber(card.variant.character.variants, card.variant.id),
      wishlistCount: card.variant.character._count.wishlists,
      seriesName: card.variant.character.series.name,
      characterName: card.variant.character.name,
    })),
    filter,
  );
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / COLLECTION_PAGE_SIZE));
  const safePage = total === 0 ? 0 : Math.min(Math.max(0, page), pages - 1);
  const cards = filtered.slice(safePage * COLLECTION_PAGE_SIZE, safePage * COLLECTION_PAGE_SIZE + COLLECTION_PAGE_SIZE);
  return { total, cards, page: safePage, owned: ownedCards.length };
}

export async function getCard(cardId: string) {
  return prisma.card.findUnique({
    where: { id: cardId.trim().toLowerCase() },
    include: cardInclude,
  });
}

export async function rememberGrab(discordId: string, cardId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "User"
    SET "lastGrabbedCardId" = ${cardId}
    WHERE "discordId" = ${discordId}
      AND "id" = (SELECT "ownerId" FROM "Card" WHERE "id" = ${cardId})
  `;
}

export async function lastGrabbedCard(discordId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { discordId },
    select: { lastGrabbedCardId: true },
  });
  return user?.lastGrabbedCardId ?? null;
}

/** Cards minted before short codes keep their long ids until the bot rewrites them. */
export async function shortenLegacyCardCodes(): Promise<number> {
  const cards = await prisma.card.findMany({ select: { id: true } });
  let changed = 0;
  for (const card of cards) {
    if (isCardCode(card.id)) continue;
    await prisma.$transaction(async (tx) => {
      const slots = await tx.dropSlot.findMany({
        where: { cardId: card.id },
        select: { id: true },
      });
      const next = await mintCardCode(async (id) => {
        const existing = await tx.card.findUnique({ where: { id }, select: { id: true } });
        return existing !== null;
      });
      if (slots.length > 0) {
        await tx.dropSlot.updateMany({ where: { cardId: card.id }, data: { cardId: null } });
      }
      await tx.card.update({ where: { id: card.id }, data: { id: next } });
      if (slots.length > 0) {
        await tx.dropSlot.updateMany({
          where: { id: { in: slots.map((slot) => slot.id) } },
          data: { cardId: next },
        });
      }
    });
    changed += 1;
  }
  return changed;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

const lookupInclude = {
  series: true,
  variants: true,
  _count: { select: { wishlists: true } },
} as const;

/** Discord select menus hold 25 options, so lookup pages are this long. */
export const LOOKUP_PAGE_SIZE = 25;

/** Characters that match the query, best match first: names, aliases, then series. */
export async function searchCharacters(query: string, page = 0) {
  if (parseQuery(query).length === 0) return { total: 0, page: 0, characters: [] };
  const all = await prisma.character.findMany({ include: lookupInclude });
  const matched = rankCharacters(query, all);
  const total = matched.length;
  const pages = Math.max(1, Math.ceil(total / LOOKUP_PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), pages - 1);
  const start = safePage * LOOKUP_PAGE_SIZE;
  return { total, page: safePage, characters: matched.slice(start, start + LOOKUP_PAGE_SIZE) };
}

export async function getLookupCharacter(id: string) {
  return prisma.character.findUnique({
    where: { id },
    include: lookupInclude,
  });
}

export type CirculationHolder = {
  cardId: string;
  ownerId: string | null;
  printNumber: number;
  quality: string;
  ownerName: string;
  avatarUrl: string | null;
  mine: boolean;
};

type CirculationCard = {
  id: string;
  printNumber: number;
  quality: string;
  ownerId: string | null;
  owner: {
    discordId: string;
    discordAvatar: string | null;
    preferredName: string | null;
    discordUsername: string | null;
  } | null;
};

export function collapseHolders(holders: CirculationHolder[]): CirculationHolder[] {
  const lowest = new Map<string, CirculationHolder>();
  const unclaimed: CirculationHolder[] = [];
  for (const holder of holders) {
    if (!holder.ownerId) {
      unclaimed.push(holder);
      continue;
    }
    const key = `${holder.quality}:${holder.ownerId}`;
    const current = lowest.get(key);
    if (!current || holder.printNumber < current.printNumber) lowest.set(key, holder);
  }
  return [...lowest.values(), ...unclaimed].sort(
    (a, b) => a.printNumber - b.printNumber || a.ownerName.localeCompare(b.ownerName),
  );
}

export function summarizeCirculation(nextPrint: number | null | undefined, cards: CirculationCard[], viewerId?: string) {
  const byQuality: Record<string, number> = {};
  const holders: CirculationHolder[] = cards
    .slice()
    .sort((a, b) => a.printNumber - b.printNumber)
    .map((card) => {
      byQuality[card.quality] = (byQuality[card.quality] ?? 0) + 1;
      return {
        cardId: card.id,
        ownerId: card.ownerId,
        printNumber: card.printNumber,
        quality: card.quality,
        ownerName: card.owner ? akiraAddressName(card.owner) : "Unclaimed",
        avatarUrl: card.owner ? discordAvatarUrl(card.owner.discordId, card.owner.discordAvatar) : null,
        mine: Boolean(viewerId && card.ownerId === viewerId),
      };
    });
  return {
    generated: nextPrint ? Math.max(0, nextPrint - 1) : 0,
    circulation: cards.length,
    byQuality,
    holders: collapseHolders(holders),
  };
}

export async function editionCirculation(variantId: string, viewerId?: string) {
  const [counter, cards] = await Promise.all([
    prisma.printCounter.findUnique({ where: { variantId } }),
    prisma.card.findMany({
      where: { variantId },
      select: {
        id: true,
        printNumber: true,
        quality: true,
        ownerId: true,
        owner: {
          select: { discordId: true, discordAvatar: true, preferredName: true, discordUsername: true },
        },
      },
      orderBy: { printNumber: "asc" },
    }),
  ]);
  const missing = cards
    .map((card) => card.owner)
    .filter((owner): owner is NonNullable<typeof owner> => Boolean(owner && owner.discordAvatar == null))
    .map((owner) => owner.discordId);
  const remembered = await rememberDiscordAvatars(missing);
  const hydrated = cards.map((card) => {
    if (!card.owner) return card;
    const avatar = remembered.get(card.owner.discordId);
    if (avatar === undefined) return card;
    return { ...card, owner: { ...card.owner, discordAvatar: avatar } };
  });
  return summarizeCirculation(counter?.nextPrint, hydrated, viewerId);
}

async function resolveWishlistCharacter(name: string) {
  const q = normalize(name);
  const all = await prisma.character.findMany();
  const exact = all.filter((character) => normalize(character.name) === q || normalize(character.slug) === q);
  const pool = exact.length > 0
    ? exact
    : all.filter((character) => normalize(character.name).includes(q) || normalize(character.slug).includes(q));
  if (pool.length === 0) {
    throw new GameError("missing", `Akira couldn't find a character called "${name.trim()}".`);
  }
  if (pool.length > 1) {
    const names = pool.map((character) => character.name).join(", ");
    throw new GameError("ambiguous", `Akira found more than one match: ${names}. Try the full name.`);
  }
  return pool[0]!;
}

export async function showWishlist(discordId: string) {
  const user = await findUserByDiscordId(discordId);
  if (!user) return [];
  return prisma.wishlist.findMany({
    where: { userId: user.id },
    include: { character: { include: { series: true } } },
    orderBy: { character: { name: "asc" } },
  });
}

export async function addWishlist(discordId: string, username: string, name: string) {
  const user = await ensureUser(discordId, username);
  const character = await resolveWishlistCharacter(name);
  const existing = await prisma.wishlist.findUnique({
    where: { userId_characterId: { userId: user.id, characterId: character.id } },
  });
  if (existing) {
    throw new GameError("exists", `Akira is already watching ${character.name} for you.`);
  }
  await prisma.wishlist.create({
    data: { userId: user.id, characterId: character.id },
  });
  return character;
}

export async function removeWishlist(discordId: string, username: string, name: string) {
  const user = await ensureUser(discordId, username);
  const character = await resolveWishlistCharacter(name);
  const existing = await prisma.wishlist.findUnique({
    where: { userId_characterId: { userId: user.id, characterId: character.id } },
  });
  if (!existing) {
    throw new GameError("missing", `Akira wasn't watching ${character.name} for you.`);
  }
  await prisma.wishlist.delete({ where: { id: existing.id } });
  return character;
}

/** Take watched characters off one player's list after they receive a copy. Returns the names removed. */
export async function clearWishlistOnObtain(userId: string, characterIds: string[]): Promise<string[]> {
  const ids = [...new Set(characterIds.filter((id) => id.length > 0))];
  if (ids.length === 0) return [];
  const watched = await prisma.wishlist.findMany({
    where: { userId, characterId: { in: ids } },
    select: { character: { select: { name: true } } },
  });
  if (watched.length === 0) return [];
  await prisma.wishlist.deleteMany({ where: { userId, characterId: { in: ids } } });
  return watched.map((row) => row.character.name);
}

export async function clearWishlistsForOwnedCards(cardIds: string[]): Promise<void> {
  const ids = [...new Set(cardIds.filter((id) => id.length > 0))];
  if (ids.length === 0) return;
  const cards = await prisma.card.findMany({
    where: { id: { in: ids }, ownerId: { not: null } },
    select: { ownerId: true, variant: { select: { characterId: true } } },
  });
  const byOwner = new Map<string, string[]>();
  for (const card of cards) {
    if (!card.ownerId) continue;
    const list = byOwner.get(card.ownerId) ?? [];
    list.push(card.variant.characterId);
    byOwner.set(card.ownerId, list);
  }
  await Promise.all([...byOwner.entries()].map(([userId, characterIds]) => clearWishlistOnObtain(userId, characterIds)));
}

/** Clear watches for the cards that just moved, then say which names the new owner stops watching. */
export async function noteWishlistReceipts(cardIds: string[]): Promise<Array<{ ownerId: string; characterName: string }>> {
  const ids = [...new Set(cardIds.filter((id) => id.length > 0))];
  if (ids.length === 0) return [];
  const cards = await prisma.card.findMany({
    where: { id: { in: ids }, ownerId: { not: null } },
    select: {
      ownerId: true,
      variant: { select: { characterId: true, character: { select: { name: true } } } },
    },
  });
  const cleared = await Promise.all(
    cards.map(async (card) => {
      if (!card.ownerId) return [];
      const names = await clearWishlistOnObtain(card.ownerId, [card.variant.characterId]);
      return names.map((characterName) => ({ ownerId: card.ownerId!, characterName }));
    }),
  );
  return cleared.flat();
}

export async function playerSummary(discordId: string) {
  const user = await findUserByDiscordId(discordId);
  if (!user) return null;
  const cards = await prisma.card.count({ where: { ownerId: user.id } });
  return { user, cards };
}
