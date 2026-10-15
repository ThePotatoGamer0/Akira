import type { Quality } from "./balance.js";

export type CardOrder = "print" | "wishlist";

export type CardFilter = {
  series?: string;
  character?: string;
  edition?: number;
  tag?: string;
  quality?: Quality;
  order?: CardOrder;
};

export type FilterCard = {
  printNumber: number;
  quality: string;
  tag: string | null;
  obtainedAt: Date;
  wishlistCount: number;
  edition: number;
  seriesName: string;
  characterName: string;
};

export type ParsedFilters =
  | { ok: true; filter: CardFilter; text: string }
  | { ok: false; reason: "not-filters" | "invalid"; message: string };

const KEYS = ["s", "c", "e", "t", "q", "o"] as const;

const QUALITY_BY_WORD: Record<string, Quality> = {
  "1": "COMMON",
  common: "COMMON",
  "2": "UNCOMMON",
  uncommon: "UNCOMMON",
  "3": "RARE",
  rare: "RARE",
  "4": "EPIC",
  epic: "EPIC",
  "5": "LEGENDARY",
  legendary: "LEGENDARY",
};

const QUALITY_NUMBER: Record<Quality, string> = {
  COMMON: "1",
  UNCOMMON: "2",
  RARE: "3",
  EPIC: "4",
  LEGENDARY: "5",
};

const NOT_FILTERS = "Akira doesn't understand those filters. Try s:, c:, e:, t:, q:, or o:.";

function loose(value: string): string {
  return value.trim().toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
}

function includesLoose(haystack: string, needle: string): boolean {
  return loose(haystack).includes(loose(needle));
}

function isKey(token: string): boolean {
  return (KEYS as readonly string[]).includes(token.toLowerCase());
}

function startsFilter(tokens: string[], index: number): boolean {
  const token = tokens[index] ?? "";
  if (/^(s|c|e|t|q|o):/i.test(token)) return true;
  return isKey(token) && (tokens[index + 1] ?? "").toLowerCase() === "is";
}

export function canonicalFilters(filter: CardFilter): string {
  const parts: string[] = [];
  if (filter.series) parts.push(`s:${filter.series}`);
  if (filter.character) parts.push(`c:${filter.character}`);
  if (filter.edition != null) parts.push(`e:${filter.edition}`);
  if (filter.tag) parts.push(`t:${filter.tag}`);
  if (filter.quality) parts.push(`q:${QUALITY_NUMBER[filter.quality]}`);
  if (filter.order === "print") parts.push("o:#");
  if (filter.order === "wishlist") parts.push("o:w");
  return parts.join(" ");
}

export function packFilterText(text: string): string {
  if (!text) return "";
  return Buffer.from(text, "utf8").toString("base64url");
}

export function unpackFilterText(packed: string): string {
  if (!packed) return "";
  return Buffer.from(packed, "base64url").toString("utf8");
}

/** Empty text is no filter. A bad value is still a filter attempt. Anything else is ordinary text. */
export function filtersAreInvocable(raw: string): boolean {
  const parsed = parseCardFilters(raw);
  return parsed.ok || parsed.reason === "invalid";
}

export function parseCardFilters(raw: string): ParsedFilters {
  const text = raw.trim();
  if (!text) return { ok: true, filter: {}, text: "" };
  const tokens = text.split(/\s+/);
  const found: { key: string; value: string }[] = [];
  let index = 0;
  while (index < tokens.length) {
    if (!startsFilter(tokens, index)) return { ok: false, reason: "not-filters", message: NOT_FILTERS };
    const token = tokens[index]!;
    const colon = /^(s|c|e|t|q|o):(.*)$/i.exec(token);
    let key: string;
    const parts: string[] = [];
    if (colon) {
      key = colon[1]!.toLowerCase();
      if (colon[2]) parts.push(colon[2]);
      index += 1;
    } else {
      key = token.toLowerCase();
      index += 2;
    }
    while (index < tokens.length && !startsFilter(tokens, index)) {
      parts.push(tokens[index]!);
      index += 1;
    }
    const value = parts.join(" ").trim();
    if (!value) return { ok: false, reason: "invalid", message: `Akira needs a value after ${key}.` };
    found.push({ key, value });
  }
  return compileFilters(found);
}

function compileFilters(found: { key: string; value: string }[]): ParsedFilters {
  const filter: CardFilter = {};
  for (const item of found) {
    if (item.key === "s") {
      filter.series = item.value;
      continue;
    }
    if (item.key === "c") {
      filter.character = item.value;
      continue;
    }
    if (item.key === "e") {
      if (!/^\d+$/.test(item.value) || Number(item.value) < 1) {
        return { ok: false, reason: "invalid", message: "Edition numbers start at 1." };
      }
      filter.edition = Number(item.value);
      continue;
    }
    if (item.key === "t") {
      const name = item.value.trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(name)) {
        return { ok: false, reason: "invalid", message: "Tag names are one word: letters, numbers, - and _." };
      }
      filter.tag = name;
      continue;
    }
    if (item.key === "q") {
      const quality = QUALITY_BY_WORD[item.value.trim().toLowerCase()];
      if (!quality) {
        return { ok: false, reason: "invalid", message: "Quality is 1 to 5: common, uncommon, rare, epic, or legendary." };
      }
      filter.quality = quality;
      continue;
    }
    const order = item.value.trim().toLowerCase();
    if (order === "i" || order === "injured") {
      return { ok: false, reason: "invalid", message: "Akira doesn't have injured cards. Use o:# for low prints or o:w for wishlists." };
    }
    if (order === "#" || order === "print" || order === "prints") {
      filter.order = "print";
      continue;
    }
    if (order === "w" || order === "wishlist" || order === "wishlists") {
      filter.order = "wishlist";
      continue;
    }
    return { ok: false, reason: "invalid", message: "Sort with o:# for low prints or o:w for wishlists." };
  }
  return { ok: true, filter, text: canonicalFilters(filter) };
}

export function applyCardFilters<T extends FilterCard>(cards: readonly T[], filter: CardFilter): T[] {
  const matched = cards.filter((card) => {
    if (filter.series && !includesLoose(card.seriesName, filter.series)) return false;
    if (filter.character && !includesLoose(card.characterName, filter.character)) return false;
    if (filter.edition != null && card.edition !== filter.edition) return false;
    if (filter.tag != null && (card.tag ?? "").toLowerCase() !== filter.tag) return false;
    if (filter.quality && card.quality !== filter.quality) return false;
    return true;
  });
  return matched.slice().sort((a, b) => {
    if (filter.order === "print" && a.printNumber !== b.printNumber) return a.printNumber - b.printNumber;
    if (filter.order === "wishlist" && a.wishlistCount !== b.wishlistCount) return b.wishlistCount - a.wishlistCount;
    return b.obtainedAt.getTime() - a.obtainedAt.getTime();
  });
}
