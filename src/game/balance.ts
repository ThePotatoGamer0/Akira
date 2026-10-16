export const QUALITIES = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"] as const;
export type Quality = (typeof QUALITIES)[number];

export const BASE_ART_WEIGHT = 100;
export const RARE_ALT_WEIGHT = 15;
export const SECRET_RARE_ALT_WEIGHT = 3;
export const DEFAULT_ALT_WEIGHT = RARE_ALT_WEIGHT;

export const DROP_SLOT_COUNT = 3;
export const DEFAULT_FRAME_ID = 0;

export const DROP_COOLDOWN_MS = 20 * 60 * 1000;
export const GRAB_COOLDOWN_MS = 5 * 60 * 1000;
export const DROP_OPEN_MS = 2 * 60 * 1000;
export const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
/** Opening window where the dropper can take back a card someone else grabbed. */
export const DROP_PROTECTION_MS = 20 * 1000;

export const GRAB_BITS = 5;
export const DAILY_BITS = 100;

export const BURN_BITS: Record<Quality, number> = {
  COMMON: 20,
  UNCOMMON: 50,
  RARE: 100,
  EPIC: 200,
  LEGENDARY: 500,
};

const QUALITY_TABLE: { quality: Quality; weight: number }[] = [
  { quality: "COMMON", weight: 60 },
  { quality: "UNCOMMON", weight: 25 },
  { quality: "RARE", weight: 10 },
  { quality: "EPIC", weight: 4 },
  { quality: "LEGENDARY", weight: 1 },
];

export function isBaseVariant(variantId: string): boolean {
  return variantId.endsWith("-base");
}

/** Common and Rare bases share one weight. Secret Rare stays the rarest, even on a base. Alternate arts use the rarity label. */
export function artWeight(variantId: string, rarity: string): number {
  if (rarity === "Secret Rare") return SECRET_RARE_ALT_WEIGHT;
  if (isBaseVariant(variantId)) return BASE_ART_WEIGHT;
  if (rarity === "Rare") return RARE_ALT_WEIGHT;
  return DEFAULT_ALT_WEIGHT;
}

export function pickWeighted<T extends { weight: number }>(items: readonly T[], rng: () => number): T {
  if (items.length === 0) {
    throw new Error("Cannot pick from an empty table");
  }
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  if (total <= 0) {
    throw new Error("Cannot pick from a table with no weight");
  }
  let roll = rng() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll < 0) return item;
  }
  return items[items.length - 1]!;
}

export function rollQuality(rng: () => number, legendaryWeight = 1): Quality {
  const table = QUALITY_TABLE.map((row) =>
    row.quality === "LEGENDARY" ? { quality: row.quality, weight: legendaryWeight } : row,
  );
  return pickWeighted(table, rng).quality;
}

export function rollArts<T extends { id: string; rarity: string }>(
  variants: readonly T[],
  rng: () => number,
  count = DROP_SLOT_COUNT,
  weightOf: (variant: T) => number = (variant) => artWeight(variant.id, variant.rarity),
): T[] {
  if (variants.length === 0) {
    throw new Error("Cannot roll from an empty catalog");
  }
  const table = variants.map((variant) => ({
    variant,
    weight: weightOf(variant),
  }));
  return Array.from({ length: count }, () => pickWeighted(table, rng).variant);
}

export function burnPayout(quality: string): number {
  if ((QUALITIES as readonly string[]).includes(quality)) {
    return BURN_BITS[quality as Quality];
  }
  return BURN_BITS.COMMON;
}

export function dailyPayout(passiveBitsBonus: number): number {
  return DAILY_BITS + Math.max(0, passiveBitsBonus);
}

/** The next print to hand out, and the counter value to store afterwards. */
export function issuePrint(currentNext: number): { printNumber: number; nextPrint: number } {
  if (!Number.isInteger(currentNext) || currentNext < 1) {
    throw new Error("Print counter must be a positive integer");
  }
  return { printNumber: currentNext, nextPrint: currentNext + 1 };
}

export type ClaimDecision =
  | { ok: true; foughtOff: boolean }
  | { ok: false; reason: "expired" | "taken" | "cooldown" };

export function decideClaim(input: {
  now: number;
  expiresAt: number;
  dropCreatedAt: number;
  slotClaimed: boolean;
  claimerIsDropper: boolean;
  claimedByDropper: boolean;
  grabReadyAt: number | null;
}): ClaimDecision {
  if (input.now >= input.expiresAt) return { ok: false, reason: "expired" };
  if (input.grabReadyAt !== null && input.now < input.grabReadyAt) {
    return { ok: false, reason: "cooldown" };
  }
  const protectedUntil = input.dropCreatedAt + DROP_PROTECTION_MS;
  if (input.slotClaimed) {
    const canFightOff = input.claimerIsDropper && !input.claimedByDropper && input.now < protectedUntil;
    if (canFightOff) return { ok: true, foughtOff: true };
    return { ok: false, reason: "taken" };
  }
  return { ok: true, foughtOff: false };
}

export function formatRemaining(ms: number): string {
  if (ms <= 0) return "ready";
  const totalSec = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) {
    const hourLabel = `${hours} ${hours === 1 ? "hour" : "hours"}`;
    if (minutes <= 0) return hourLabel;
    const minuteLabel = `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
    return `${hourLabel} ${minuteLabel}`;
  }
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export function claimFailureMessage(
  reason: "expired" | "taken" | "cooldown",
  grabRemainingMs: number,
): string {
  if (reason === "expired") return "This drop has expired and the cards can no longer be grabbed.";
  if (reason === "taken") return "Someone already took that card.";
  return `Akira needs you to wait ${formatRemaining(grabRemainingMs)} before grabbing again.`;
}

export const SLOT_EMOJIS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"] as const;

export function positionFromEmoji(name: string | null | undefined): number | null {
  if (!name) return null;
  if (name === "ak_slot_1") return 1;
  if (name === "ak_slot_2") return 2;
  if (name === "ak_slot_3") return 3;
  if (name === "ak_slot_4") return 4;
  const normalized = name.replace(/\uFE0F/g, "");
  if (normalized === "1⃣") return 1;
  if (normalized === "2⃣") return 2;
  if (normalized === "3⃣") return 3;
  if (normalized === "4⃣") return 4;
  return null;
}
