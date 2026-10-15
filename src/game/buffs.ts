import { artWeight, DROP_COOLDOWN_MS, GRAB_COOLDOWN_MS } from "./balance.js";

export const BUFF_KINDS = [
  "drop_cooldown",
  "grab_cooldown",
  "burn_value",
  "four_cards",
  "shiny_luck",
  "featured_series",
  "quality_over_quantity",
] as const;

export type BuffKind = (typeof BUFF_KINDS)[number];

export type ShopItem = {
  id: BuffKind;
  name: string;
  description: string;
  priceBits: number;
  durationHours: number;
};

export const SHOP_ITEMS: ShopItem[] = [
  {
    id: "drop_cooldown",
    name: "Drop cooldown",
    description: "Your drop cooldown is 10 minutes instead of 20. With the server buff as well, it stops at 5 minutes.",
    priceBits: 400,
    durationHours: 24,
  },
  {
    id: "grab_cooldown",
    name: "Grab cooldown",
    description: "Your grab cooldown is 2 minutes 30 seconds instead of 5. With the server buff as well, it stops at 1 minute 15 seconds.",
    priceBits: 350,
    durationHours: 12,
  },
  {
    id: "burn_value",
    name: "Burn value",
    description: "Bits from burning a card are doubled until this ends.",
    priceBits: 300,
    durationHours: 24,
  },
  {
    id: "four_cards",
    name: "Four cards",
    description: "Your drops have four cards instead of three. It never becomes five.",
    priceBits: 500,
    durationHours: 24,
  },
  {
    id: "shiny_luck",
    name: "Shiny luck",
    description: "Mints appear 1 in 51 cards instead of 1 in 100. With the server buff as well, mints appear 1 in 34 cards.",
    priceBits: 600,
    durationHours: 24,
  },
  {
    id: "featured_series",
    name: "Featured series",
    description: "Today's featured series is twice as likely in your drops. The series is locked in when you buy it.",
    priceBits: 450,
    durationHours: 24,
  },
  {
    id: "quality_over_quantity",
    name: "Quality over quantity",
    description: "Your drop is one card, and MAIN characters are eight times as likely.",
    priceBits: 500,
    durationHours: 24,
  },
];

export function shopItem(id: string): ShopItem | null {
  return SHOP_ITEMS.find((item) => item.id === id) ?? null;
}

const SERVER_POOL: BuffKind[][] = [
  ["grab_cooldown"],
  ["drop_cooldown", "shiny_luck"],
  ["four_cards"],
];

export function poolTier(bits: number): number {
  if (bits >= 5000) return 4;
  if (bits >= 2500) return 3;
  if (bits >= 2000) return 2;
  if (bits >= 500) return 1;
  return 0;
}

export function poolChoices(tier: number): BuffKind[] {
  if (tier <= 0) return [];
  return SERVER_POOL.slice(0, Math.min(tier, 3)).flat();
}

export function pickServerBuffs(tier: number, rng: () => number): BuffKind[] {
  const choices = [...poolChoices(tier)];
  if (choices.length === 0) return [];
  const count = tier >= 4 ? Math.min(2, choices.length) : 1;
  const picked: BuffKind[] = [];
  for (let i = 0; i < count; i++) {
    const index = Math.min(choices.length - 1, Math.floor(rng() * choices.length));
    const [next] = choices.splice(index, 1);
    if (next) picked.push(next);
  }
  return picked;
}

export const MILESTONES = [
  { step: 1, cost: 250, payout: 200 },
  { step: 2, cost: 500, payout: 350 },
  { step: 3, cost: 1_000, payout: 600 },
  { step: 4, cost: 2_000, payout: 1_000 },
  { step: 5, cost: 4_000, payout: 2_000 },
  { step: 6, cost: 8_000, payout: 3_500 },
  { step: 7, cost: 16_000, payout: 6_000 },
  { step: 8, cost: 32_000, payout: 10_000 },
  { step: 9, cost: 64_000, payout: 18_000 },
  { step: 10, cost: 128_000, payout: 30_000 },
] as const;

export type PrestigeKind = "burn" | "grab" | "drop" | "mint" | "main";

const PRESTIGE_AT: Record<number, PrestigeKind> = {
  6: "burn",
  7: "grab",
  8: "drop",
  9: "mint",
  10: "main",
};

export function milestoneAt(step: number): (typeof MILESTONES)[number] | null {
  return MILESTONES.find((row) => row.step === step) ?? null;
}

export function nextMilestone(claimed: number): (typeof MILESTONES)[number] | null {
  return milestoneAt(claimed + 1);
}

export function prestigeKinds(claimed: number): PrestigeKind[] {
  const kinds: PrestigeKind[] = [];
  for (let step = 6; step <= Math.min(10, claimed); step++) {
    const kind = PRESTIGE_AT[step];
    if (kind) kinds.push(kind);
  }
  return kinds;
}

export function prestigeLine(kind: PrestigeKind, stacks: number): string {
  if (kind === "burn") return `Burns pay ${stacks}% more.`;
  if (kind === "grab") return `Grab cooldown is ${stacks}% shorter.`;
  if (kind === "drop") return `Drop cooldown is ${stacks}% shorter.`;
  if (kind === "mint") return `Mints are ${stacks}% more likely.`;
  return `MAIN characters are ${stacks}% more likely.`;
}

export function prestigePreview(claimed: number, progress: number): {
  canPrestige: boolean;
  bitsLeft: number | null;
  waiting: string;
  keep: string[];
} {
  const keep = prestigeKinds(claimed).map((kind) => prestigeLine(kind, 1));
  const next = nextMilestone(claimed);
  if (!next) {
    return {
      canPrestige: claimed >= 5,
      bitsLeft: null,
      waiting: "This is the last milestone.",
      keep,
    };
  }
  const bitsLeft = Math.max(0, next.cost - progress);
  const pay = `Waiting pays ${next.payout.toLocaleString("en-US")} bits`;
  let waiting = `${bitsLeft.toLocaleString("en-US")} bits still to give. ${pay}.`;
  if (next.step === 6) {
    waiting = `${bitsLeft.toLocaleString("en-US")} bits still to give. ${pay}, and prestiging after that makes burns pay 1% more.`;
  } else if (next.step > 6) {
    waiting = `${bitsLeft.toLocaleString("en-US")} bits still to give. ${pay}, and adds that tier's permanent on top of every earlier one.`;
  }
  return { canPrestige: claimed >= 5, bitsLeft, waiting, keep };
}

export function prestigeBlurb(step: number): string | null {
  if (step === 6) return "Prestige after this and burns pay 1% more.";
  if (step === 7) return "Prestige after this and your grab cooldown is 1% shorter.";
  if (step === 8) return "Prestige after this and your drop cooldown is 1% shorter.";
  if (step === 9) return "Prestige after this and mints are a little more likely.";
  if (step === 10) return "Prestige after this and MAIN characters are 1% more likely.";
  return null;
}

export type PrestigeStacks = {
  burn: number;
  grab: number;
  drop: number;
  mint: number;
  main: number;
};

export const EMPTY_PRESTIGE: PrestigeStacks = { burn: 0, grab: 0, drop: 0, mint: 0, main: 0 };

export type ActiveEffects = {
  shop: BuffKind[];
  server: BuffKind[];
  seriesId: string | null;
  prestige: PrestigeStacks;
};

export type ResolvedEffects = {
  dropCooldownMs: number;
  grabCooldownMs: number;
  burnMultiplier: number;
  cardCount: number;
  legendaryWeight: number;
  seriesId: string | null;
  qualityOverQuantity: boolean;
  mainMultiplier: number;
};

function has(list: BuffKind[], kind: BuffKind): boolean {
  return list.includes(kind);
}

export function resolveEffects(input: ActiveEffects): ResolvedEffects {
  const shopDrop = has(input.shop, "drop_cooldown");
  const serverDrop = has(input.server, "drop_cooldown");
  let dropCooldownMs = DROP_COOLDOWN_MS;
  if (shopDrop) dropCooldownMs = 10 * 60 * 1000;
  if (serverDrop) dropCooldownMs = shopDrop ? 5 * 60 * 1000 : 10 * 60 * 1000;
  dropCooldownMs = Math.round(dropCooldownMs * (1 - 0.01 * input.prestige.drop));

  const shopGrab = has(input.shop, "grab_cooldown");
  const serverGrab = has(input.server, "grab_cooldown");
  let grabCooldownMs = GRAB_COOLDOWN_MS;
  if (shopGrab) grabCooldownMs /= 2;
  if (serverGrab) grabCooldownMs /= 2;
  grabCooldownMs = Math.round(grabCooldownMs * (1 - 0.01 * input.prestige.grab));

  const burnMultiplier = (has(input.shop, "burn_value") ? 2 : 1) * (1 + 0.01 * input.prestige.burn);
  const qualityOverQuantity = has(input.shop, "quality_over_quantity");
  const four = has(input.shop, "four_cards") || has(input.server, "four_cards");
  const cardCount = qualityOverQuantity ? 1 : four ? 4 : 3;
  const shinySources = Number(has(input.shop, "shiny_luck")) + Number(has(input.server, "shiny_luck"));
  const legendaryBase = shinySources === 0 ? 1 : shinySources === 1 ? 2 : 3;
  const legendaryWeight = legendaryBase * (1 + 0.01 * input.prestige.mint);
  const seriesId = has(input.shop, "featured_series") ? input.seriesId : null;
  const mainMultiplier = (qualityOverQuantity ? 8 : 1) * (1 + 0.01 * input.prestige.main);

  return {
    dropCooldownMs,
    grabCooldownMs,
    burnMultiplier,
    cardCount,
    legendaryWeight,
    seriesId,
    qualityOverQuantity,
    mainMultiplier,
  };
}

function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  const minuteLabel = `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  if (seconds === 0) return minuteLabel;
  const secondLabel = `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
  return `${minuteLabel} ${secondLabel}`;
}

export function mintSentence(legendaryWeight: number, shinySources: number): string {
  if (shinySources <= 0) {
    return legendaryWeight > 1
      ? "Mints appear a little more often than 1 in 100 cards."
      : "Mints appear 1 in 100 cards.";
  }
  if (shinySources === 1) {
    return legendaryWeight > 2
      ? "Mints appear a little more often than 1 in 51 cards."
      : "Mints appear 1 in 51 cards.";
  }
  return legendaryWeight > 3
    ? "Mints appear a little more often than 1 in 34 cards."
    : "Mints appear 1 in 34 cards.";
}

export function combinedLines(input: ActiveEffects): string[] {
  const resolved = resolveEffects(input);
  const lines: string[] = [];
  if (has(input.shop, "drop_cooldown") || has(input.server, "drop_cooldown") || input.prestige.drop > 0) {
    lines.push(`Reduces your drop cooldown to ${clock(resolved.dropCooldownMs)}.`);
  }
  if (has(input.shop, "grab_cooldown") || has(input.server, "grab_cooldown") || input.prestige.grab > 0) {
    lines.push(`Reduces your grab cooldown to ${clock(resolved.grabCooldownMs)}.`);
  }
  if (has(input.shop, "burn_value") || input.prestige.burn > 0) {
    if (has(input.shop, "burn_value") && input.prestige.burn > 0) {
      lines.push(`Burns pay double, then ${input.prestige.burn}% more.`);
    } else if (has(input.shop, "burn_value")) {
      lines.push("Burns pay double.");
    } else {
      lines.push(`Burns pay ${input.prestige.burn}% more.`);
    }
  }
  const shinySources = Number(has(input.shop, "shiny_luck")) + Number(has(input.server, "shiny_luck"));
  if (shinySources > 0 || input.prestige.mint > 0) {
    lines.push(mintSentence(resolved.legendaryWeight, shinySources));
  }
  if (resolved.cardCount === 4) lines.push("Your drops have four cards.");
  if (resolved.qualityOverQuantity) {
    lines.push("Your drops have one card, and MAIN characters are much more likely.");
  }
  if (resolved.seriesId) lines.push("Today's bought series is twice as likely in your drops.");
  if (input.prestige.main > 0) lines.push(`MAIN characters are ${input.prestige.main}% more likely.`);
  return lines;
}

export function dropWeight(input: {
  variantId: string;
  rarity: string;
  seriesId: string;
  role: string | null;
  effects: ResolvedEffects;
}): number {
  let weight = artWeight(input.variantId, input.rarity);
  if (input.effects.seriesId && input.seriesId === input.effects.seriesId) weight *= 2;
  if (input.role === "MAIN") weight *= input.effects.mainMultiplier;
  return weight;
}

export function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function startOfUtcDay(now = new Date()): Date {
  return new Date(`${utcDay(now)}T00:00:00.000Z`);
}

export function missedMidnight(lastReset: Date | null, now = new Date()): boolean {
  const today = startOfUtcDay(now);
  if (!lastReset) return now.getTime() >= today.getTime();
  return lastReset.getTime() < today.getTime();
}

export function extendExpiry(current: Date | null, now: Date, durationMs: number): Date {
  const base = current && current.getTime() > now.getTime() ? current.getTime() : now.getTime();
  return new Date(base + durationMs);
}
