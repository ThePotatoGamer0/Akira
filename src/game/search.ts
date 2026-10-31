/**
 * The one search behind lookup, wishlists, the bot and the WebUI.
 *
 * A query is a list of terms. Words have to appear in the thing being searched
 * for, in any order, so "man chainsaw" finds "Chainsaw Man". A misspelling is
 * forgiven when it is one edit away, and a half-typed word matches the start of
 * a longer one. `kind:value` words narrow the search to that field. Quoted
 * phrases and `-words` are understood too.
 *
 * The result is a score: exact names beat the start of a word, which beats a
 * word run together, which beats a correction. Higher is better; 0 is no match.
 */

import { foldSearch } from "./series-meta.js";

/** Words too common to narrow anything. */
const STOP_WORDS = new Set([
  "a", "an", "and", "at", "by", "de", "der", "die", "das", "el", "la", "le", "les", "no", "of", "on", "the", "to", "von", "wa",
]);

/** Fields a `kind:value` word can be limited to. */
export type SearchField = "series" | "owns" | "quality" | "tag" | "kind" | "year";

/** One typed word, after folding and after any `kind:` was taken off it. */
export type QueryTerm = {
  /** The folded text a field is compared against. */
  text: string;
  /** The field a `kind:value` term is limited to. */
  field: SearchField | null;
  /** A `-kind:value` term must not match. */
  negated: boolean;
  /** True for a quoted phrase, which is scored as a prefix of a field. */
  phrase: boolean;
};

const FIELD_ALIASES: Record<string, SearchField> = {
  s: "series",
  series: "series",
  ow: "owns",
  own: "owns",
  owns: "owns",
  q: "quality",
  quality: "quality",
  cond: "quality",
  t: "tag",
  tag: "tag",
  k: "kind",
  kind: "kind",
  y: "year",
  year: "year",
};

/** Split on whitespace but keep "quoted phrases" together, minus the quotes. */
function words(raw: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (const char of raw) {
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && /\s/.test(char)) {
      if (current) out.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current) out.push(current);
  return out;
}

/** Every meaningful term in a query, in the order they were typed. */
export function parseQuery(raw: string): QueryTerm[] {
  const terms: QueryTerm[] = [];
  for (const word of words(raw)) {
    let text = word;
    let negated = false;
    if (text.startsWith("-") && text.length > 1) {
      negated = true;
      text = text.slice(1);
    }
    const colon = text.indexOf(":");
    if (colon > 0) {
      const field = FIELD_ALIASES[text.slice(0, colon).toLowerCase()];
      if (field) {
        const value = foldSearch(text.slice(colon + 1));
        if (value) terms.push({ text: value, field, negated, phrase: false });
        continue;
      }
    }
    const folded = foldSearch(text);
    if (!folded || STOP_WORDS.has(folded)) continue;
    terms.push({ text: folded, field: null, negated, phrase: word.includes(" ") });
  }
  return terms;
}

/** True when a query has anything worth searching for. */
export function hasQuery(raw: string): boolean {
  return parseQuery(raw).length > 0;
}

/** Levenshtein distance. Enough for a typo, cheap enough to run per word. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let previous = new Array<number>(b.length + 1);
  let current = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) previous[j] = j;
  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost);
    }
    [previous, current] = [current, previous];
  }
  return previous[b.length] ?? 0;
}

/** Longer terms can hold more typos: under 5 letters none, 5–6 one, 7+ two. */
function allowedTypos(text: string): number {
  if (text.length < 5) return 0;
  if (text.length < 7) return 1;
  return 2;
}

/**
 * How well one field answers one term.
 *
 * - the whole field is the term: 1000
 * - a word in the field is the term: 600 (a strict `tag:` field accepts only this)
 * - a word starts with the term: 450 (typing "chai" finds "Chainsaw")
 * - the field's words glued together start with it: 400 (an extra space in the way)
 * - some word is one or two typos away: 250 down to 150
 * - the field merely contains the term: 100
 *
 * A field with several words cannot answer a single word by starting with it,
 * or "man" would match every field whose first letters happen to be "man".
 */
export function fieldScore(term: string, field: string, strict = false): number {
  if (!term || !field) return 0;
  const value = foldSearch(field);
  if (!value) return 0;
  if (value === term) return 1000;
  const tokens = value.split(" ");
  if (tokens.includes(term)) return 600;
  if (strict) return 0;
  if (tokens.length === 1 && tokens[0]?.startsWith(term)) return 450;
  // A word split across two of the field's words, so "chyansaw" finds "Chainsaw Man".
  const glued = tokens.join("");
  if (glued.startsWith(term)) return 400;
  const typos = allowedTypos(term);
  if (typos > 0) {
    let best = Number.POSITIVE_INFINITY;
    for (const token of tokens) {
      if (Math.abs(token.length - term.length) > typos) continue;
      const distance = editDistance(term, token);
      if (distance < best) best = distance;
    }
    if (best <= typos) return 300 - best * 50;
  }
  if (value.includes(term)) return 100;
  return 0;
}

/** How one term scores against a record's fields: the best field wins. */
export function termScore(term: QueryTerm, fields: string[], strict = false): number {
  let best = 0;
  for (const field of fields) {
    const score = fieldScore(term.text, field, strict);
    if (score > best) best = score;
  }
  return best;
}

/** Every term must match somewhere. Positive terms add up; negated terms only veto. */
export function scoreQuery(terms: QueryTerm[], fields: string[]): number {
  let total = 0;
  for (const term of terms) {
    const score = termScore(term, fields);
    if (term.negated) {
      if (score > 0) return 0;
      continue;
    }
    if (score === 0) return 0;
    total += score;
  }
  return total;
}
