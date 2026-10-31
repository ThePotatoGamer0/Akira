import type { CardQuality } from "../generated/prisma/enums.js";

/** How a card's condition reads on the WebUI, best first. */
export const CONDITION_WORDS: [CardQuality, string][] = [
  ["LEGENDARY", "mint"],
  ["EPIC", "excellent"],
  ["RARE", "good"],
  ["UNCOMMON", "poor"],
  ["COMMON", "damaged"],
];

/** The condition a typed word names, or null. "dam" finds damaged. */
export function qualityForWord(word: string): CardQuality | null {
  const needle = word.trim().toLowerCase();
  if (!needle) return null;
  return CONDITION_WORDS.find(([, label]) => label.startsWith(needle))?.[0] ?? null;
}

export function conditionWord(quality: string): string {
  return CONDITION_WORDS.find(([name]) => name === quality)?.[1] ?? "";
}
