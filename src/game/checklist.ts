import { prisma } from "../db/client.js";
import { GameError } from "./errors.js";
import { setSeriesTracked } from "./stats.js";

export type SeriesChoice = { id: string; name: string };

export type SeriesMatch<T extends { name: string }> =
  | { match: T }
  | { match: null; kind: "empty" }
  | { match: null; kind: "none" }
  | { match: null; kind: "many"; names: string[] };

export type MissingSeries = { name: string; missing: string[] };

export type ChecklistPage = {
  series: string;
  names: string[];
  /** 1-based slice of this series when the list is too long for one page. */
  part: number;
  parts: number;
  missing: number;
};

const PAGE_LIMIT = 1900;

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Exact name, then a unique start of the name. Several fits stay unresolved. */
export function matchSeriesQuery<T extends { name: string }>(query: string, series: readonly T[]): SeriesMatch<T> {
  const needle = normalize(query);
  if (!needle) return { match: null, kind: "empty" };

  const exact = series.filter((row) => normalize(row.name) === needle);
  if (exact.length === 1) return { match: exact[0]! };

  const prefix = series.filter((row) => normalize(row.name).startsWith(needle));
  if (prefix.length === 1) return { match: prefix[0]! };
  if (prefix.length > 1) return { match: null, kind: "many", names: prefix.map((row) => row.name) };
  return { match: null, kind: "none" };
}

function stillLooking(count: number): string {
  return count === 1 ? "Still looking for 1." : `Still looking for ${count}.`;
}

function splitNames(names: string[], heading: string): string[][] {
  if (names.length === 0) return [[]];
  const budget = PAGE_LIMIT - heading.length - 2;
  const chunks: string[][] = [];
  let current: string[] = [];
  let used = 0;
  for (const name of names) {
    const line = `• ${name}`;
    const extra = (current.length === 0 ? 0 : 1) + line.length;
    if (current.length > 0 && used + extra > budget) {
      chunks.push(current);
      current = [name];
      used = line.length;
    } else {
      current.push(name);
      used += extra;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/** One page per series. A long missing list becomes extra pages for that series. */
export function paginateChecklist(rows: readonly MissingSeries[]): ChecklistPage[] {
  const pages: ChecklistPage[] = [];
  for (const row of rows) {
    const heading = row.missing.length === 0 ? "You have every character." : stillLooking(row.missing.length);
    const chunks = splitNames(row.missing, heading);
    const parts = Math.max(1, chunks.length);
    chunks.forEach((names, index) => {
      pages.push({
        series: row.name,
        names,
        part: index + 1,
        parts,
        missing: row.missing.length,
      });
    });
  }
  return pages;
}

export function checklistPageBody(page: ChecklistPage): string {
  if (page.missing === 0) return "You have every character.";
  const heading = stillLooking(page.missing);
  if (page.names.length === 0) return heading;
  return `${heading}\n\n${page.names.map((name) => `• ${name}`).join("\n")}`;
}

export async function trackedMissing(userId: string): Promise<MissingSeries[]> {
  const [tracked, owned] = await Promise.all([
    prisma.trackedSeries.findMany({
      where: { userId },
      orderBy: { position: "asc" },
      include: {
        series: { select: { name: true, characters: { select: { id: true, name: true } } } },
      },
    }),
    prisma.card.findMany({
      where: { ownerId: userId },
      select: { variant: { select: { characterId: true } } },
    }),
  ]);
  const ownedIds = new Set(owned.map((card) => card.variant.characterId));
  return tracked.map((row) => ({
    name: row.series.name,
    missing: row.series.characters
      .filter((character) => !ownedIds.has(character.id))
      .map((character) => character.name)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
  }));
}

export async function setTrackedByName(userId: string, query: string, tracked: boolean): Promise<string> {
  const series = await prisma.series.findMany({
    where: { characters: { some: {} } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const found = matchSeriesQuery(query, series);
  if (!found.match) {
    if (found.kind === "empty") throw new GameError("missing", "Akira needs a series name.");
    if (found.kind === "many") {
      throw new GameError(
        "ambiguous",
        `Akira found more than one series: ${found.names.join(", ")}. Say a bit more of the name.`,
      );
    }
    throw new GameError("missing", `Akira couldn't find a series called "${query.trim()}".`);
  }

  const pinned = await prisma.trackedSeries.findUnique({
    where: { userId_seriesId: { userId, seriesId: found.match.id } },
  });
  if (tracked) {
    if (pinned) return `Akira is already tracking ${found.match.name}.`;
    await setSeriesTracked(userId, found.match.id, true);
    return `Akira is tracking ${found.match.name}.`;
  }
  if (!pinned) return `Akira isn't tracking ${found.match.name}.`;
  await setSeriesTracked(userId, found.match.id, false);
  return `Akira stopped tracking ${found.match.name}.`;
}
