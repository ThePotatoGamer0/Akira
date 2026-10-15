import type { CardQuality } from "../generated/prisma/client.js";
import { prisma } from "../db/client.js";
import { akiraAddressName } from "../utils/akira-address-name.js";
import { GameError } from "./errors.js";

const TRACKED_LIMIT = 4;

export type StatPlayer = { id: string; name: string };

export type CardCountRow = StatPlayer & { count: number };

export type CompletionRow = {
  seriesId: string;
  name: string;
  owned: number;
  total: number;
  percent: number;
  tracked: boolean;
};

export type CompletionStats = {
  user: StatPlayer;
  players: StatPlayer[];
  mode: "tracked" | "top";
  /** Default bars: tracked series when any are pinned, otherwise the top four. */
  bars: CompletionRow[];
  /** Highest completion, whether or not anything is tracked. */
  top: CompletionRow[];
  /** Pinned series, in pin order. Empty when nothing is tracked. */
  tracked: CompletionRow[];
  series: CompletionRow[];
};

function playerName(user: { preferredName?: string | null; discordUsername?: string | null }): string {
  return akiraAddressName(user);
}

function byName(a: StatPlayer, b: StatPlayer): number {
  const name = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  if (name !== 0) return name;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function percent(owned: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((owned / total) * 100);
}

async function players(): Promise<StatPlayer[]> {
  const users = await prisma.user.findMany({
    select: { id: true, preferredName: true, discordUsername: true },
  });
  return users.map((user) => ({ id: user.id, name: playerName(user) })).sort(byName);
}

/** Every player, ordered by how many cards they hold. `quality` limits the count. */
export async function cardCountStats(quality?: CardQuality): Promise<CardCountRow[]> {
  const [people, cards] = await Promise.all([
    players(),
    prisma.card.findMany({
      where: { ownerId: { not: null }, ...(quality ? { quality } : {}) },
      select: { ownerId: true },
    }),
  ]);
  const counts = new Map<string, number>();
  for (const card of cards) {
    if (!card.ownerId) continue;
    counts.set(card.ownerId, (counts.get(card.ownerId) ?? 0) + 1);
  }
  return people
    .map((person) => ({ ...person, count: counts.get(person.id) ?? 0 }))
    .sort((a, b) => b.count - a.count || byName(a, b));
}

/** Players ordered by bits, richest first. */
export async function bitsStats(): Promise<(StatPlayer & { bits: number })[]> {
  const users = await prisma.user.findMany({
    select: { id: true, preferredName: true, discordUsername: true, bits: true },
  });
  return users
    .map((user) => ({ id: user.id, name: playerName(user), bits: user.bits }))
    .sort((a, b) => b.bits - a.bits || byName(a, b));
}

/**
 * Completion is distinct characters owned in a series, over every character in that series.
 * Tracked series replace the top four when the player has pinned any.
 */
export async function completionStats(userId: string): Promise<CompletionStats> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, preferredName: true, discordUsername: true },
  });
  if (!user) throw new GameError("missing", "Akira couldn't find that player.");

  const [people, seriesRows, ownedCards, tracked] = await Promise.all([
    players(),
    prisma.series.findMany({
      select: { id: true, name: true, _count: { select: { characters: true } } },
    }),
    prisma.card.findMany({
      where: { ownerId: userId },
      select: { variant: { select: { characterId: true, character: { select: { seriesId: true } } } } },
    }),
    prisma.trackedSeries.findMany({
      where: { userId },
      orderBy: { position: "asc" },
      select: { seriesId: true },
    }),
  ]);

  const ownedBySeries = new Map<string, Set<string>>();
  for (const card of ownedCards) {
    const seriesId = card.variant.character.seriesId;
    const held = ownedBySeries.get(seriesId) ?? new Set<string>();
    held.add(card.variant.characterId);
    ownedBySeries.set(seriesId, held);
  }
  const trackedIds = new Set(tracked.map((row) => row.seriesId));
  const series: CompletionRow[] = seriesRows
    .filter((row) => row._count.characters > 0)
    .map((row) => {
      const owned = ownedBySeries.get(row.id)?.size ?? 0;
      const total = row._count.characters;
      return {
        seriesId: row.id,
        name: row.name,
        owned,
        total,
        percent: percent(owned, total),
        tracked: trackedIds.has(row.id),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || (a.seriesId < b.seriesId ? -1 : 1));

  const byId = new Map(series.map((row) => [row.seriesId, row]));
  const trackedBars = tracked.flatMap((row) => {
    const found = byId.get(row.seriesId);
    return found ? [found] : [];
  });
  const top = [...series]
    .filter((row) => row.owned > 0)
    .sort((a, b) => b.percent - a.percent || b.owned - a.owned || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    .slice(0, TRACKED_LIMIT);

  return {
    user: { id: user.id, name: playerName(user) },
    players: people,
    mode: trackedBars.length > 0 ? "tracked" : "top",
    bars: trackedBars.length > 0 ? trackedBars : top,
    top,
    tracked: trackedBars,
    series,
  };
}

/** Pin or unpin a series on the signed-in player's completion card. */
export async function setSeriesTracked(userId: string, seriesId: string, tracked: boolean): Promise<void> {
  const series = await prisma.series.findUnique({ where: { id: seriesId }, select: { id: true } });
  if (!series) throw new GameError("missing", "Akira couldn't find that series.");

  if (!tracked) {
    await prisma.trackedSeries.deleteMany({ where: { userId, seriesId } });
    const rest = await prisma.trackedSeries.findMany({ where: { userId }, orderBy: { position: "asc" } });
    await prisma.$transaction(
      rest.map((row, index) =>
        prisma.trackedSeries.update({
          where: { userId_seriesId: { userId, seriesId: row.seriesId } },
          data: { position: index },
        }),
      ),
    );
    return;
  }

  const existing = await prisma.trackedSeries.findMany({ where: { userId }, select: { seriesId: true } });
  if (existing.some((row) => row.seriesId === seriesId)) return;
  if (existing.length >= TRACKED_LIMIT) {
    throw new GameError("limit", "Akira only tracks four animes. Untrack one first.");
  }
  await prisma.trackedSeries.create({ data: { userId, seriesId, position: existing.length } });
}
