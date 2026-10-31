/**
 * Typeahead for the WebUI search boxes. Returns the best matches while you
 * type, each with the words that matched so the UI can mark them.
 */

import { prisma } from "../db/client.js";
import { parseQuery, termScore, type QueryTerm } from "./search.js";
import { rankCharacters, rankSeries, type SearchableCharacter } from "./search-records.js";
import { displaySeriesName, foldSearch, seriesMeta, type SeriesTitleStyle } from "./series-meta.js";

export type SearchSuggestion = {
  kind: "character" | "series";
  id: string;
  label: string;
  /** Series title for a character; the other title for a series. May be empty. */
  detail: string;
  /** WebUI path that opens this character or series. */
  href: string;
  /** The words of the label that matched, so the UI can mark them. */
  words: string[];
};

export const SUGGESTION_LIMIT = 8;

function matchedWords(terms: QueryTerm[], label: string): string[] {
  const words = label.split(/\s+/);
  const folded = words.map((word) => foldSearch(word));
  const hit = new Set<number>();
  for (const term of terms) {
    folded.forEach((word, index) => {
      if (word === term.text || word.startsWith(term.text)) hit.add(index);
    });
  }
  return words.filter((_, index) => hit.has(index));
}

/**
 * The best characters and series for a half-typed query. `series:` and other
 * field words narrow a search, so they are left out of the suggestion text.
 */
export async function searchSuggestions(
  query: string,
  style: SeriesTitleStyle = "english",
  limit = SUGGESTION_LIMIT,
): Promise<SearchSuggestion[]> {
  const terms = parseQuery(query).filter((term) => !term.negated && term.field === null);
  if (terms.length === 0) return [];
  const text = terms.map((term) => term.text).join(" ");
  const [characters, series] = await Promise.all([
    prisma.character.findMany({ include: { series: true } }),
    prisma.series.findMany({ select: { id: true, name: true, slug: true } }),
  ]);
  // A name you typed beats a series you typed. Characters that only came in
  // through their series are left to the full results below.
  const ranked = rankCharacters(text, characters);
  const names = ranked.filter((character) => isNameMatch(terms, character)).slice(0, limit);
  const seriesRows = rankSeries(text, series).slice(0, limit + 2);
  const suggestions: SearchSuggestion[] = [
    ...names.map((character): SearchSuggestion => ({
      kind: "character",
      id: character.id,
      label: character.name,
      detail: displaySeriesName(character.series.slug, character.series.name, style),
      href: `/characters/${character.series.slug}/${character.slug}`,
      words: matchedWords(terms, character.name),
    })),
    ...seriesRows.map((row): SearchSuggestion => {
      const meta = seriesMeta(row.slug);
      const title = displaySeriesName(row.slug, row.name, style);
      const other = style === "english" ? meta.romaji : meta.english;
      return {
        kind: "series",
        id: row.id,
        label: title,
        detail: other && other !== title ? other : "",
        href: `/characters/${row.slug}`,
        words: matchedWords(terms, title),
      };
    }),
  ];
  return suggestions.slice(0, limit + 2);
}

/** True when the query matches the character's own name, not only the series it came from. */
function isNameMatch(terms: QueryTerm[], character: SearchableCharacter): boolean {
  const own = [character.name, character.slug, character.aliases ?? ""];
  return terms.some((term) => termScore(term, own) > 0);
}