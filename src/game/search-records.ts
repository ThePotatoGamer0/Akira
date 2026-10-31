/**
 * What the search box looks at for a character or a series. Kept here so the
 * bot, the lookup command, and the WebUI rank the same things the same way.
 */

import { parseQuery, scoreQuery, termScore, type QueryTerm, type SearchField } from "./search.js";
import { foldSearch, seriesSearchFields } from "./series-meta.js";

/** Characters can be found by their own names and by the series they are from. */
export type SearchableCharacter = {
  name: string;
  slug: string;
  aliases: string | null;
  series: { slug: string; name: string };
};

/** A little weight so a character whose own name matches outranks one found through its series. */
const SERIES_WEIGHT = 0.6;

/** The series a character belongs to, as the search sees it. */
export function characterSeriesFields(character: Pick<SearchableCharacter, "series">): string[] {
  return seriesSearchFields(character.series.slug, character.series.name);
}

/** Every field of a character the search looks at, with the series fields repeated. */
export function characterFields(character: SearchableCharacter): string[] {
  return [
    character.name,
    character.slug,
    character.aliases ?? "",
    foldSearch(character.series.name),
    character.series.slug,
  ];
}

/**
 * How well a character answers the query. Name and alias matches count fully;
 * a match only through the series title counts for `SERIES_WEIGHT`.
 */
export function scoreCharacter(terms: QueryTerm[], character: SearchableCharacter): number {
  const own = [character.name, character.slug, character.aliases ?? ""];
  const series = characterSeriesFields(character);
  let total = 0;
  for (const term of terms) {
    const ownScore = termScore(term, own);
    const seriesScore = termScore(term, series) * SERIES_WEIGHT;
    const score = Math.max(ownScore, seriesScore);
    if (term.negated) {
      if (score > 0) return 0;
      continue;
    }
    if (score === 0) return 0;
    total += score;
  }
  return total;
}

/** Characters that match, best first. Ties go to the shorter name, then the alphabet. */
export function rankCharacters<T extends SearchableCharacter>(query: string, characters: T[]): T[] {
  const terms = parseQuery(query);
  if (terms.length === 0) return [];
  return characters
    .flatMap((character) => {
      const score = scoreCharacter(terms, character);
      return score > 0 ? [{ character, score }] : [];
    })
    .sort((a, b) =>
      b.score - a.score
      || a.character.name.length - b.character.name.length
      || a.character.name.localeCompare(b.character.name, undefined, { sensitivity: "base" }),
    )
    .map((row) => row.character);
}

/** Series are found by slug, English title, romaji title, and aliases. */
export function rankSeries<T extends { slug: string; name: string }>(query: string, series: T[]): T[] {
  const terms = parseQuery(query);
  if (terms.length === 0) return [];
  return series
    .flatMap((row) => {
      const score = scoreQuery(terms, [...seriesSearchFields(row.slug, row.name), foldSearch(row.name)]);
      return score > 0 ? [{ row, score }] : [];
    })
    .sort((a, b) => b.score - a.score || a.row.name.localeCompare(b.row.name, undefined, { sensitivity: "base" }))
    .map((row) => row.row);
}

/** Only the terms aimed at a field, for callers that filter those themselves. */
export function termsFor(terms: QueryTerm[], field: SearchField): QueryTerm[] {
  return terms.filter((term) => term.field === field);
}

/** The terms that are plain words, which entity records are scored against. */
export function plainTerms(terms: QueryTerm[]): QueryTerm[] {
  return terms.filter((term) => term.field === null);
}
