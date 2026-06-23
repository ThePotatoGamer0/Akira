/** Thresholds in bits for server pool tiers (spec). */
export const POOL_TIER_THRESHOLDS = [0, 500, 1500, 3000, 6000, 12000] as const;

/** Roll success chance per tier (tier 1–5). Tier 0 never rolls a buff. */
export const POOL_TIER_CHANCES = [0, 0.4, 0.55, 0.6, 0.65, 0.75] as const;

export function tierFromPoolBits(totalBits: number): number {
  let t = 0;
  for (let i = POOL_TIER_THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalBits >= POOL_TIER_THRESHOLDS[i]!) {
      t = i;
      break;
    }
  }
  return t;
}

export function poolChanceForTier(tier: number): number {
  if (tier <= 0 || tier > 5) return 0;
  return POOL_TIER_CHANCES[tier] ?? 0;
}
