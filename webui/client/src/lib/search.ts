/** The words of a query that search a record's own fields, for small in-page filters. */
type Word = { text: string; negated: boolean };

/** Split a query into folded words, dropping the stop words a lookup would. */
function words(query: string): Word[] {
  return query
    .split(/\s+/)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((word) => word.length > 0)
    .map((word) => ({ text: word.toLowerCase(), negated: false }));
}

/** How far a word is from another: 0 for equal or a prefix, more for typos. */
function closeness(word: string, value: string): number {
  const fold = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const tokens = fold.split(" ");
  if (tokens.includes(word)) return 0;
  if (tokens.some((token) => token.startsWith(word))) return 1;
  if (word.length >= 5 && tokens.some((token) => Math.abs(token.length - word.length) <= 1 && typoDistance(word, token) <= 1)) {
    return 2;
  }
  return Number.POSITIVE_INFINITY;
}

function typoDistance(a: string, b: string): number {
  if (a.length !== b.length) return 1;
  let misses = 0;
  for (let index = 0; index < a.length; index++) {
    if (a[index] !== b[index]) misses += 1;
    if (misses > 1) return misses;
  }
  return misses;
}

/**
 * Rank records by a small query the same way the server's search does: every
 * word has to land somewhere, exact words beat prefixes, which beat typos.
 */
export function rankByWords<T>(query: string, rows: T[], fieldsOf: (row: T) => string[]): T[] {
  const wanted = words(query);
  if (wanted.length === 0) return rows;
  return rows
    .flatMap((row) => {
      const fields = fieldsOf(row);
      let total = 0;
      for (const word of wanted) {
        let best = Number.POSITIVE_INFINITY;
        for (const field of fields) best = Math.min(best, closeness(word.text, field));
        if (!Number.isFinite(best)) return [];
        total += 3 - best;
      }
      return [{ row, total }];
    })
    .sort((a, b) => b.total - a.total)
    .map((entry) => entry.row);
}
