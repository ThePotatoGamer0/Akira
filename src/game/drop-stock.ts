import { MINT_PITY_DROPS, type Quality } from "./balance.js";
import { FEATURED_SERIES_CHANCE, type ResolvedEffects } from "./buffs.js";

/**
 * Shared drop shelves.
 * Card count, shiny luck, and a bought series are the same for every player in that state.
 * Prestige and the pity mint still belong to one player, so those drops are rolled live.
 */
export type DropShape = {
  frameId: number;
  cardCount: number;
  qualityOverQuantity: boolean;
  legendaryWeight: number;
  seriesId: string | null;
};

export const DROP_SHAPES: Array<Omit<DropShape, "frameId" | "seriesId">> = [
  { qualityOverQuantity: false, cardCount: 3, legendaryWeight: 1 },
  { qualityOverQuantity: false, cardCount: 3, legendaryWeight: 2 },
  { qualityOverQuantity: false, cardCount: 3, legendaryWeight: 3 },
  { qualityOverQuantity: false, cardCount: 4, legendaryWeight: 1 },
  { qualityOverQuantity: false, cardCount: 4, legendaryWeight: 2 },
  { qualityOverQuantity: false, cardCount: 4, legendaryWeight: 3 },
  { qualityOverQuantity: true, cardCount: 1, legendaryWeight: 1 },
  { qualityOverQuantity: true, cardCount: 1, legendaryWeight: 2 },
  { qualityOverQuantity: true, cardCount: 1, legendaryWeight: 3 },
];

export function dropShape(effects: ResolvedEffects, frameId: number): DropShape | null {
  if (effects.mainMultiplier !== 1) return null;
  if (effects.legendaryWeight !== 1 && effects.legendaryWeight !== 2 && effects.legendaryWeight !== 3) return null;
  const known = DROP_SHAPES.some(
    (shape) =>
      shape.cardCount === effects.cardCount &&
      shape.qualityOverQuantity === effects.qualityOverQuantity &&
      shape.legendaryWeight === effects.legendaryWeight,
  );
  if (!known) return null;
  return {
    frameId,
    cardCount: effects.cardCount,
    qualityOverQuantity: effects.qualityOverQuantity,
    legendaryWeight: effects.legendaryWeight,
    seriesId: effects.seriesId,
  };
}

/** Two plain drops cover back-to-back players. A bought series keeps one until it is taken. */
export function shelfDepth(shape: DropShape): number {
  return shape.seriesId ? 1 : 2;
}

export function dropShapeKey(shape: DropShape): string {
  return `${shape.frameId}:${shape.qualityOverQuantity ? "q" : "n"}:${shape.cardCount}:${shape.legendaryWeight}:${shape.seriesId ?? ""}`;
}

export function shelfDepthForKey(key: string): number {
  const seriesId = key.split(":").slice(4).join(":");
  return seriesId ? 1 : 2;
}

export function effectsForShape(shape: DropShape): ResolvedEffects {
  return {
    dropCooldownMs: 0,
    grabCooldownMs: 0,
    burnMultiplier: 1,
    cardCount: shape.cardCount,
    legendaryWeight: shape.legendaryWeight,
    seriesId: shape.seriesId,
    featuredSeriesChance: shape.seriesId ? FEATURED_SERIES_CHANCE : 0,
    qualityOverQuantity: shape.qualityOverQuantity,
    mainMultiplier: 1,
  };
}

/** A shelved drop can be served when pity would leave its qualities alone. */
export function pityKeepsQualities(dropsSinceMint: number, qualities: readonly Quality[]): boolean {
  if (qualities.length === 0) return false;
  if (qualities.some((quality) => quality === "LEGENDARY")) return true;
  return dropsSinceMint + 1 < MINT_PITY_DROPS;
}
