const CONDITION: Record<string, string> = {
  COMMON: "damaged",
  UNCOMMON: "poor",
  RARE: "good",
  EPIC: "excellent",
  LEGENDARY: "mint",
};

export function qualityCondition(quality: string): string {
  return CONDITION[quality] ?? quality.toLowerCase();
}

export function showsShiny(quality: string, dye: string | null): boolean {
  return quality === "LEGENDARY" || Boolean(dye);
}
