/**
 * The WebUI collection search, ranked by the shared search engine.
 *
 * A card is scored on what a player would type to find it: the character's
 * name and aliases, the edition, the series title, the card's tag and alias,
 * its condition, its print number, and its card code. A typed `series:` or
 * `tag:` narrows to that field; a negated one leaves those cards out. The rest
 * of the query has to match somewhere on the card.
 *
 * `collectionNarrowing` and `collectionPrefilter` translate the parts SQL can
 * decide (a named series, a named condition, plain `-words`) into a query, so a
 * big collection is never read whole for no reason.
 */

import type { CardQuality, Prisma } from "../generated/prisma/client.js";
import { CONDITION_WORDS, conditionWord, qualityForWord } from "./conditions.js";
import { fieldScore, parseQuery, scoreQuery, type QueryTerm } from "./search.js";
import { foldSearch, seriesSearchFields, seriesSlugsMatching } from "./series-meta.js";

export type SearchableCard = {
  id: string;
  tag: string | null;
  alias: string | null;
  quality: string;
  dye: string | null;
  printNumber: number;
  /** When the player got it, used to break ties and for `year:2024`. */
  obtainedAt: Date;
  variant: {
    name: string;
    character: {
      name: string;
      slug: string;
      aliases: string | null;
      series: { name: string; slug: string };
    };
  };
};

function cardFields(card: SearchableCard): string[] {
  const { character } = card.variant;
  const series = seriesSearchFields(character.series.slug, character.series.name);
  return [
    character.name,
    character.slug,
    character.aliases ?? "",
    card.variant.name,
    card.tag ?? "",
    card.alias ?? "",
    card.dye ?? "",
    conditionWord(card.quality),
    card.quality,
    String(card.printNumber),
    foldSearch(card.id),
    ...series.map((value) => foldSearch(value)).filter((value) => value.length > 0),
  ];
}

/** A card's year, for `year:2024`, is the year the player got it. */
function isYearTerm(term: QueryTerm | null): boolean {
  return term !== null && term.field === "year" && /^\d{4}$/.test(term.text);
}

/** `owns:` is about the player, which a card list already guarantees, so it is ignored. */
function fieldTerms(terms: QueryTerm[]): Map<string, QueryTerm[]> {
  const byField = new Map<string, QueryTerm[]>();
  for (const term of terms) {
    if (!term.field || term.field === "owns" || term.field === "year") continue;
    const list = byField.get(term.field) ?? [];
    list.push(term);
    byField.set(term.field, list);
  }
  return byField;
}

function valueFor(card: SearchableCard, field: string): string[] {
  const { character } = card.variant;
  if (field === "series") return seriesSearchFields(character.series.slug, character.series.name);
  if (field === "tag") return [card.tag ?? ""];
  if (field === "quality") return [conditionWord(card.quality), card.quality];
  if (field === "kind") return [card.variant.name];
  return [];
}

/** The whole field, or one of its words, or where a word starts: a real hit. Good for SQL. */
function resolves(term: QueryTerm, card: SearchableCard): boolean {
  return cardFields(card).some((field) => fieldScore(term.text, field) >= 400);
}

/** The card without the fields SQL saw, for a quick check before the full score. */
function shallow(card: SearchableCard): SearchableCard {
  return {
    ...card,
    id: card.id,
    alias: card.alias,
    dye: card.dye,
    variant: {
      ...card.variant,
      character: { ...card.variant.character, aliases: null, series: { name: "", slug: "" } },
    },
  };
}

/**
 * Score and rank the cards in memory. Returns the matching ids, best first.
 * Cards come from the SQL prefilter, which already settled the series, the
 * condition, and the plain words; anything it could not see (an alias, a typo)
 * is carried in `extra` and checked here.
 */
export function rankCollection(
  query: string,
  cards: SearchableCard[],
  extra: SearchableCard[] = [],
): string[] {
  const terms = parseQuery(query);
  if (terms.length === 0) return cards.map((card) => card.id);
  const narrow = fieldTerms(terms);
  const plain = terms.filter((term) => term.field === null && !term.negated);
  const year = terms.find((term) => isYearTerm(term) && !term.negated)?.text ?? "";
  const keeps = (card: SearchableCard): boolean => {
    for (const [field, wanted] of narrow) {
      const values = valueFor(card, field);
      for (const term of wanted) {
        const hit = values.some((value) => fieldScore(term.text, value, true) > 0);
        if (term.negated ? hit : !hit) return false;
      }
    }
    return !year || String(card.obtainedAt.getFullYear()) === year;
  };
  const seen = new Set(cards.map((card) => card.id));
  const all = cards.filter(keeps);
  for (const card of extra) {
    if (seen.has(card.id) || !keeps(card)) continue;
    if (plain.every((term) => resolves(term, shallow(card)))) continue;
    all.push(card);
  }
  return all
    .flatMap((card) => {
      const score = plain.length === 0 ? 0 : scoreQuery(plain, cardFields(card));
      return plain.length > 0 && score === 0 ? [] : [{ id: card.id, score, order: card.obtainedAt.getTime() }];
    })
    // A tie goes to the newest card, then the card code, so pages stay stable.
    .sort((a, b) => b.score - a.score || b.order - a.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((row) => row.id);
}

export type CollectionNarrowing = {
  /** Series slugs a `series:` word named. Only those cards are loaded. */
  seriesSlugs: string[];
  /** Conditions any word named. Only those cards are loaded. */
  qualities: CardQuality[];
  /** Plain `-words`, which SQL can leave out exactly the way it leaves out a substring. */
  excluded: string[];
};

/**
 * The conditions the query names, from `quality:` words and from plain words
 * that start with a condition name ("goo" → good). Negated words are skipped.
 */
function namedQualities(terms: QueryTerm[]): CardQuality[] {
  const qualities: CardQuality[] = [];
  for (const term of terms) {
    if (term.negated) continue;
    if (term.field === "quality" || (term.field === null && term.text.length >= 3)) {
      const quality = qualityForWord(term.text);
      if (quality) qualities.push(quality);
    }
  }
  return qualities;
}

/** Every series a `series:` word names. A misspelling in a field word is a plain word instead. */
function namedSeries(terms: QueryTerm[]): string[] {
  return terms
    .filter((term) => term.field === "series" && !term.negated)
    .flatMap((term) => seriesSlugsMatching(term.text));
}

/**
 * How far SQL can narrow the player's cards. Series through SQL alone; a
 * condition through either its name or any word; and plain `-words` become
 * `not contains`, which is the same rule the substring search always used.
 */
export function collectionNarrowing(query: string): CollectionNarrowing {
  const terms = parseQuery(query);
  return {
    seriesSlugs: [...new Set(namedSeries(terms))],
    qualities: [...new Set(namedQualities(terms))],
    excluded: terms.filter((term) => term.negated && term.field === null && term.text.length >= 2).map((term) => term.text),
  };
}

/** SQL takes either a named condition or a word that starts like one. */
function qualityWhere(qualities: CardQuality[], terms: QueryTerm[]): Prisma.CardWhereInput | null {
  const or: Prisma.CardWhereInput[] = [];
  if (qualities.length > 0) or.push({ quality: { in: qualities } });
  const typed = terms
    .filter((term) => !term.negated && term.field === null && term.text.length >= 3)
    .flatMap((term) => {
      const quality = qualityForWord(term.text);
      return quality ? [quality] : [];
    });
  if (typed.length > 0) or.push({ quality: { in: typed } });
  return or.length === 0 ? null : { OR: or };
}

/** The columns a plain word is allowed to touch, the same ones the ranker reads. */
function wordWhere(word: string): Prisma.CardWhereInput {
  return {
    OR: [
      { id: { contains: word } },
      { tag: { contains: word } },
      { alias: { contains: word } },
      { dye: { contains: word } },
      { variant: { name: { contains: word } } },
      { variant: { character: { name: { contains: word } } } },
      { variant: { character: { aliases: { contains: word } } } },
      { variant: { character: { series: { name: { contains: word } } } } },
      { variant: { character: { series: { slug: { contains: word } } } } },
    ],
  };
}

/**
 * How far SQL can narrow the player's cards: the series a `series:` word names,
 * the condition any word names, and the plain `-words` to leave out. Plain words
 * themselves are left to the ranker, which has to see aliases and typos too.
 */
export function collectionPrefilter(query: string): Prisma.CardWhereInput | null {
  const terms = parseQuery(query);
  const { seriesSlugs, qualities, excluded } = collectionNarrowing(query);
  const and: Prisma.CardWhereInput[] = [];
  const quality = qualityWhere(qualities, terms);
  if (quality) and.push(quality);
  for (const word of excluded) and.push({ NOT: wordWhere(word) });

  const where: Prisma.CardWhereInput = {};
  if (seriesSlugs.length > 0) where.variant = { character: { series: { slug: { in: seriesSlugs } } } };
  if (and.length > 0) where.AND = and;
  return Object.keys(where).length === 0 ? null : where;
}
