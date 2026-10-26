import fs from "node:fs";
import path from "node:path";
import { DIR_INPUT_CHARACTERS } from "../utils/paths.js";

export type SeriesTitleStyle = "romaji" | "english";

/** AniList romaji, or the localized English title. */

export type SeriesMeta = {
  aliases: string[];
  romaji: string | null;
  english: string | null;
};

/** Lowercase and treat punctuation as spaces so "Dress-Up" and "Dress Up" match. */
export function foldSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/['\u2018\u2019\u201a\u201b`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchesSearch(query: string, ...fields: string[]): boolean {
  const needle = foldSearch(query);
  if (!needle) return false;
  return fields.some((field) => foldSearch(field).includes(needle));
}

export function seriesTitleStyle(value: string | null | undefined): SeriesTitleStyle {
  return value === "romaji" ? "romaji" : "english";
}

function readSeriesMeta(seriesDir: string): SeriesMeta {
  const file = path.join(seriesDir, "series.json");
  if (!fs.existsSync(file)) return { aliases: [], romaji: null, english: null };
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8")) as {
      aliases?: unknown;
      romaji?: unknown;
      english?: unknown;
    };
    const aliases = Array.isArray(data.aliases)
      ? data.aliases.filter((item): item is string => typeof item === "string" && item.trim() !== "")
      : [];
    return {
      aliases,
      romaji: typeof data.romaji === "string" && data.romaji.trim() ? data.romaji.trim() : null,
      english: typeof data.english === "string" && data.english.trim() ? data.english.trim() : null,
    };
  } catch {
    return { aliases: [], romaji: null, english: null };
  }
}

let bySlug: Map<string, SeriesMeta> | null = null;

function catalog(): Map<string, SeriesMeta> {
  if (bySlug) return bySlug;
  bySlug = new Map();
  if (!fs.existsSync(DIR_INPUT_CHARACTERS)) return bySlug;
  for (const name of fs.readdirSync(DIR_INPUT_CHARACTERS)) {
    const dir = path.join(DIR_INPUT_CHARACTERS, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    bySlug.set(name, readSeriesMeta(dir));
  }
  return bySlug;
}

export function seriesMeta(slug: string): SeriesMeta {
  return catalog().get(slug) ?? { aliases: [], romaji: null, english: null };
}

export function displaySeriesName(slug: string, fallback: string, style: SeriesTitleStyle): string {
  const meta = seriesMeta(slug);
  if (style === "english") return meta.english || meta.romaji || fallback;
  return meta.romaji || meta.english || fallback;
}

export function seriesSearchFields(slug: string, name: string): string[] {
  const meta = seriesMeta(slug);
  return [name, slug, meta.romaji ?? "", meta.english ?? "", ...meta.aliases].filter(Boolean);
}

export function seriesSlugsMatching(query: string): string[] {
  return [...catalog().entries()]
    .filter(([slug, meta]) => matchesSearch(query, slug, meta.romaji ?? "", meta.english ?? "", ...meta.aliases))
    .map(([slug]) => slug);
}
