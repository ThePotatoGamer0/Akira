import fs from "node:fs";
import { QUALITIES } from "./balance.js";
import { editionCirculation } from "./cards.js";
import { prisma } from "../db/client.js";
import { editionOrder } from "./editions.js";
import { GameError } from "./errors.js";
import { seriesCoverPath, variantArtPath } from "../utils/paths.js";
import { displaySeriesName, matchesSearch, seriesSearchFields, type SeriesTitleStyle } from "./series-meta.js";

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function percent(owned: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((owned / total) * 100);
}

export function sortSeriesByCompletion<T extends { percent: number; name: string }>(rows: T[]): T[] {
  return rows.slice().sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name));
}

export function sortCatalogSeries<T extends { id: string; tracked: boolean; percent: number; name: string }>(
  rows: T[],
  pinOrder: string[],
): T[] {
  const order = new Map(pinOrder.map((id, index) => [id, index]));
  return rows.slice().sort((a, b) => {
    const aPin = a.tracked ? (order.get(a.id) ?? 0) : Number.POSITIVE_INFINITY;
    const bPin = b.tracked ? (order.get(b.id) ?? 0) : Number.POSITIVE_INFINITY;
    if (aPin !== bPin) return aPin - bPin;
    return b.percent - a.percent || a.name.localeCompare(b.name);
  });
}

export function applyCatalogTrack<T extends { id: string; tracked: boolean; percent: number; name: string }>(
  rows: T[],
  seriesId: string,
  tracked: boolean,
): T[] {
  const pinOrder = rows.filter((row) => row.tracked && row.id !== seriesId).map((row) => row.id);
  if (tracked) pinOrder.push(seriesId);
  return sortCatalogSeries(
    rows.map((row) => (row.id === seriesId ? { ...row, tracked } : row)),
    pinOrder,
  );
}

export function sortSeriesCharacters<T extends { owned: boolean; name: string }>(characters: T[]): T[] {
  return characters.slice().sort((a, b) => Number(a.owned) - Number(b.owned) || a.name.localeCompare(b.name));
}

function aliasesOf(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

type CoverSource = {
  role: string | null;
  name: string;
  slug: string;
  variants: { id: string; name: string; image: string }[];
};

export type CatalogCover = {
  seriesSlug: string;
  characterSlug: string;
  image: string;
  v: number;
};

function artVersion(seriesSlug: string, characterSlug: string, image: string): number {
  try {
    return Math.floor(fs.statSync(variantArtPath(seriesSlug, characterSlug, image)).mtimeMs);
  } catch {
    return 0;
  }
}

export function pickCoverCharacter<T extends CoverSource>(characters: T[]): T | undefined {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name);
  const mains = characters.filter((character) => character.role === "MAIN").sort(byName);
  return mains[0] ?? characters.slice().sort(byName)[0];
}

function coverFor(seriesSlug: string, characters: CoverSource[]): CatalogCover | null {
  const character = pickCoverCharacter(characters);
  const edition = character ? editionOrder(character.variants)[0] : undefined;
  if (!character || !edition) return null;
  return {
    seriesSlug,
    characterSlug: character.slug,
    image: edition.image,
    v: artVersion(seriesSlug, character.slug, edition.image),
  };
}

function portraitUrl(cover: CatalogCover | null): string | null {
  if (!cover) return null;
  return `/api/static/portraits/${cover.seriesSlug}/${cover.characterSlug}/${encodeURIComponent(cover.image)}`;
}

export function seriesPosterUrl(seriesSlug: string, characters: CoverSource[]): string | null {
  try {
    if (fs.existsSync(seriesCoverPath(seriesSlug))) {
      return `/api/static/covers/${seriesSlug}`;
    }
  } catch {
    /* slug rejected */
  }
  return portraitUrl(coverFor(seriesSlug, characters));
}

type CollectionRecency = {
  ownedCharacters: Set<string>;
  characterAt: Map<string, number>;
  seriesAt: Map<string, number>;
};

async function collectionRecency(userId: string): Promise<CollectionRecency> {
  const cards = await prisma.card.findMany({
    where: { ownerId: userId },
    select: {
      obtainedAt: true,
      variant: { select: { characterId: true, character: { select: { seriesId: true } } } },
    },
  });
  const ownedCharacters = new Set<string>();
  const characterAt = new Map<string, number>();
  const seriesAt = new Map<string, number>();
  for (const card of cards) {
    const at = card.obtainedAt.getTime();
    const characterId = card.variant.characterId;
    const seriesId = card.variant.character.seriesId;
    ownedCharacters.add(characterId);
    const prevCharacter = characterAt.get(characterId);
    if (prevCharacter === undefined || at > prevCharacter) characterAt.set(characterId, at);
    const prevSeries = seriesAt.get(seriesId);
    if (prevSeries === undefined || at > prevSeries) seriesAt.set(seriesId, at);
  }
  return { ownedCharacters, characterAt, seriesAt };
}

export type CatalogSeries = {
  id: string;
  name: string;
  slug: string;
  owned: number;
  total: number;
  percent: number;
  coverUrl: string | null;
  tracked: boolean;
  lastGot: number | null;
};

function titled(slug: string, name: string, style: SeriesTitleStyle): string {
  return displaySeriesName(slug, name, style);
}

export async function catalogSeries(
  userId: string,
  style: SeriesTitleStyle = "english",
  recency?: CollectionRecency,
): Promise<CatalogSeries[]> {
  const [rows, got, tracked] = await Promise.all([
    prisma.series.findMany({
      where: { characters: { some: {} } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        characters: { select: { id: true, name: true, slug: true, role: true, variants: true } },
      },
    }),
    recency ? Promise.resolve(recency) : collectionRecency(userId),
    prisma.trackedSeries.findMany({
      where: { userId },
      orderBy: { position: "asc" },
      select: { seriesId: true },
    }),
  ]);
  const pinOrder = tracked.map((row) => row.seriesId);
  const pinned = new Set(pinOrder);
  return sortCatalogSeries(
    rows.map((series) => {
      const held = series.characters.filter((character) => got.ownedCharacters.has(character.id)).length;
      return {
        id: series.id,
        name: titled(series.slug, series.name, style),
        slug: series.slug,
        owned: held,
        total: series.characters.length,
        percent: percent(held, series.characters.length),
        coverUrl: seriesPosterUrl(series.slug, series.characters),
        tracked: pinned.has(series.id),
        lastGot: got.seriesAt.get(series.id) ?? null,
      };
    }),
    pinOrder,
  );
}

export type CatalogCharacterCard = {
  id: string;
  name: string;
  slug: string;
  owned: boolean;
  wishlisted: boolean;
  cover: CatalogCover | null;
  lastGot: number | null;
};

export type CatalogSeriesDetail = {
  id: string;
  name: string;
  slug: string;
  owned: number;
  total: number;
  percent: number;
  characters: CatalogCharacterCard[];
};

export async function catalogSeriesDetail(
  userId: string,
  seriesSlug: string,
  style: SeriesTitleStyle = "english",
): Promise<CatalogSeriesDetail> {
  const series = await prisma.series.findUnique({
    where: { slug: seriesSlug },
    select: {
      id: true,
      name: true,
      slug: true,
      characters: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, slug: true, role: true, variants: true },
      },
    },
  });
  if (!series || series.characters.length === 0) throw new GameError("missing", "Akira couldn't find that series.");
  const [got, wished] = await Promise.all([
    collectionRecency(userId),
    prisma.wishlist.findMany({
      where: { userId, characterId: { in: series.characters.map((character) => character.id) } },
      select: { characterId: true },
    }),
  ]);
  const watching = new Set(wished.map((row) => row.characterId));
  const held = series.characters.filter((character) => got.ownedCharacters.has(character.id)).length;
  return {
    id: series.id,
    name: titled(series.slug, series.name, style),
    slug: series.slug,
    owned: held,
    total: series.characters.length,
    percent: percent(held, series.characters.length),
    characters: sortSeriesCharacters(
      series.characters.map((character) => ({
        id: character.id,
        name: character.name,
        slug: character.slug,
        owned: got.ownedCharacters.has(character.id),
        wishlisted: watching.has(character.id),
        cover: coverFor(series.slug, [character]),
        lastGot: got.characterAt.get(character.id) ?? null,
      })),
    ),
  };
}

export type CatalogEdition = {
  id: string;
  name: string;
  image: string;
  v: number;
  generated: number;
  circulation: number;
  byQuality: Record<string, number>;
  holders: Array<{
    cardId: string;
    ownerId: string | null;
    printNumber: number;
    quality: string;
    ownerName: string;
    avatarUrl: string | null;
    mine: boolean;
  }>;
};

export type CatalogCharacterDetail = {
  id: string;
  name: string;
  slug: string;
  series: { id: string; name: string; slug: string };
  owned: boolean;
  wishlisted: boolean;
  wishlistCount: number;
  aliases: string[];
  editions: CatalogEdition[];
};

export async function catalogCharacter(
  userId: string,
  seriesSlug: string,
  characterSlug: string,
  style: SeriesTitleStyle = "english",
): Promise<CatalogCharacterDetail> {
  const character = await prisma.character.findFirst({
    where: { slug: characterSlug, series: { slug: seriesSlug } },
    include: {
      series: true,
      variants: true,
      _count: { select: { wishlists: true } },
      wishlists: { where: { userId }, select: { id: true } },
    },
  });
  if (!character) throw new GameError("missing", "Akira couldn't find that character.");
  const owned = await prisma.card.findFirst({
    where: { ownerId: userId, variant: { characterId: character.id } },
    select: { id: true },
  });
  const editions = editionOrder(character.variants);
  const stats = await Promise.all(editions.map((edition) => editionCirculation(edition.id, userId)));
  return {
    id: character.id,
    name: character.name,
    slug: character.slug,
    series: {
      id: character.series.id,
      name: titled(character.series.slug, character.series.name, style),
      slug: character.series.slug,
    },
    owned: Boolean(owned),
    wishlisted: character.wishlists.length > 0,
    wishlistCount: character._count.wishlists,
    aliases: aliasesOf(character.aliases),
    editions: editions.map((edition, index) => ({
      id: edition.id,
      name: edition.name,
      image: edition.image,
      v: artVersion(character.series.slug, character.slug, edition.image),
      generated: stats[index]?.generated ?? 0,
      circulation: stats[index]?.circulation ?? 0,
      byQuality: Object.fromEntries(QUALITIES.map((quality) => [quality, stats[index]?.byQuality[quality] ?? 0])),
      holders: stats[index]?.holders ?? [],
    })),
  };
}

export type CatalogSearchHit = {
  id: string;
  name: string;
  slug: string;
  series: { name: string; slug: string };
  owned: boolean;
  cover: CatalogCover | null;
  lastGot: number | null;
};

function catalogViewOrder(value: string | undefined): "completion" | "alpha" | "recent" {
  return value === "alpha" || value === "recent" ? value : "completion";
}

function compareCatalogName(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

export async function catalogSearch(
  userId: string,
  query: string,
  style: SeriesTitleStyle = "english",
  viewOrder?: string,
): Promise<{
  series: CatalogSeries[];
  characters: CatalogSearchHit[];
}> {
  const q = normalize(query);
  const got = await collectionRecency(userId);
  const series = await catalogSeries(userId, style, got);
  if (!q) return { series, characters: [] };
  const characters = await prisma.character.findMany({
    include: { series: true, variants: true },
  });
  const hits = characters
    .filter((character) =>
      matchesSearch(
        query,
        character.name,
        character.slug,
        character.aliases ?? "",
        ...seriesSearchFields(character.series.slug, character.series.name),
      ),
    )
    .map((character) => ({
      id: character.id,
      name: character.name,
      slug: character.slug,
      series: {
        name: titled(character.series.slug, character.series.name, style),
        slug: character.series.slug,
      },
      owned: got.ownedCharacters.has(character.id),
      cover: coverFor(character.series.slug, [character]),
      lastGot: got.characterAt.get(character.id) ?? null,
    }));
  const order = catalogViewOrder(viewOrder);
  hits.sort((a, b) => {
    if (order === "alpha") return compareCatalogName(a.name, b.name);
    if (order === "recent") return (b.lastGot ?? 0) - (a.lastGot ?? 0) || compareCatalogName(a.name, b.name);
    return Number(a.owned) - Number(b.owned) || compareCatalogName(a.name, b.name);
  });
  return {
    series: series.filter((row) => matchesSearch(query, ...seriesSearchFields(row.slug, row.name))),
    characters: hits.slice(0, 48),
  };
}

export async function setCatalogWishlist(userId: string, characterId: string, watching: boolean): Promise<{ watching: boolean }> {
  const character = await prisma.character.findUnique({ where: { id: characterId }, select: { id: true } });
  if (!character) throw new GameError("missing", "Akira couldn't find that character.");
  const existing = await prisma.wishlist.findUnique({
    where: { userId_characterId: { userId, characterId } },
  });
  if (watching && !existing) {
    await prisma.wishlist.create({ data: { userId, characterId } });
  }
  if (!watching && existing) {
    await prisma.wishlist.delete({ where: { id: existing.id } });
  }
  return { watching };
}
