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

const MESSAGE_LIMIT = 1900;

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

function seriesChunks(row: MissingSeries): string[] {
  if (row.missing.length === 0) return [`${row.name}\nYou have every character.`];
  const chunks: string[] = [];
  let lines = [row.name];
  for (const character of row.missing) {
    const next = [...lines, `• ${character}`].join("\n");
    if (next.length > MESSAGE_LIMIT && lines.length > 1) {
      chunks.push(lines.join("\n"));
      lines = [row.name, `• ${character}`];
    } else {
      lines.push(`• ${character}`);
    }
  }
  chunks.push(lines.join("\n"));
  return chunks;
}

/** Series name, then each missing character on its own bullet. A blank line sits between series. */
export function formatChecklist(rows: readonly MissingSeries[]): string[] {
  const blocks = rows.flatMap(seriesChunks);
  const messages: string[] = [];
  let current = "";
  for (const block of blocks) {
    const next = current ? `${current}\n\n${block}` : block;
    if (next.length > MESSAGE_LIMIT && current) {
      messages.push(current);
      current = block;
    } else {
      current = next;
    }
  }
  if (current) messages.push(current);
  return messages;
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
