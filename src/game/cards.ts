import { prisma } from "../db/client.js";
import { isCardCode, mintCardCode } from "./codes.js";
import { editionNumber } from "./editions.js";
import { GameError } from "./errors.js";
import { applyCardFilters, type CardFilter } from "./filters.js";
import { ensureUser, findUserByDiscordId } from "./users.js";

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

function lookupScore(name: string, slug: string, query: string): number {
  if (name === query || slug === query) return 0;
  if (name.startsWith(query) || slug.startsWith(query)) return 1;
  return 2;
}

/** Discord select menus hold 25 options, so lookup pages are this long. */
export const LOOKUP_PAGE_SIZE = 25;

export async function searchCharacters(query: string, page = 0) {
  const q = normalize(query);
  if (!q) return { total: 0, page: 0, characters: [] };
  const all = await prisma.character.findMany({ include: lookupInclude });
  const matched = all
    .filter((character) => {
      const aliases = character.aliases ?? "";
      return (
        normalize(character.name).includes(q) ||
        normalize(character.slug).includes(q) ||
        normalize(character.series.name).includes(q) ||
        normalize(character.series.slug).includes(q) ||
        normalize(aliases).includes(q)
      );
    })
    .sort((a, b) => {
      const score = lookupScore(normalize(a.name), normalize(a.slug), q) - lookupScore(normalize(b.name), normalize(b.slug), q);
      if (score !== 0) return score;
      return a.name.localeCompare(b.name);
    });
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

export async function editionCirculation(variantId: string) {
  const [counter, grouped] = await Promise.all([
    prisma.printCounter.findUnique({ where: { variantId } }),
    prisma.card.groupBy({
      by: ["quality"],
      where: { variantId },
      _count: { _all: true },
    }),
  ]);
  const byQuality: Record<string, number> = {};
  for (const row of grouped) byQuality[row.quality] = row._count._all;
  const circulation = Object.values(byQuality).reduce((sum, count) => sum + count, 0);
  return {
    generated: counter ? Math.max(0, counter.nextPrint - 1) : 0,
    circulation,
    byQuality,
  };
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

export async function playerSummary(discordId: string) {
  const user = await findUserByDiscordId(discordId);
  if (!user) return null;
  const cards = await prisma.card.count({ where: { ownerId: user.id } });
  return { user, cards };
}
