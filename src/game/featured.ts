/**
 * Choosing the series a featured drop draws from.
 *
 * The featured slot used to walk series alphabetically and eventually land on
 * every one of them, so most players saw shows they never asked for. Now each
 * series is weighted by how many players track it, so the slot mostly draws
 * from shows players want while a browse series still comes up now and then.
 */

/**
 * How strongly a tracked series beats one nobody tracked. A series tracked by
 * 1 in 4 players sits level with an untracked one, one tracked by 3 in 4 is
 * four times likelier, and one tracked by everybody takes about nine in ten
 * featured drops. Raise the divisor to lean harder toward tracked series.
 */
const FEATURED_WEIGHT_DIVISOR = 4;
/** A series almost nobody has a picture from is not worth a featured slot, however many track it. */
export const FEATURED_ART_DEPTH = 3;

/** A series in the running for a featured drop: who tracks it, and how much art it has. */
export type FeaturedCandidate = { id: string; tracked: number; pictures: number };

/**
 * How much a series should be picked for the featured slot. Each player who
 * tracks it adds a share, so a series several people track comes up several
 * times as often as one nobody tracks.
 */
export function featuredWeight(candidate: FeaturedCandidate, divisor = FEATURED_WEIGHT_DIVISOR): number {
  if (candidate.pictures < FEATURED_ART_DEPTH) return 0;
  return 1 + candidate.tracked / divisor;
}

/** Pick one series, more often the ones players track. Returns -1 when there is nothing to pick. */
export function pickFeatured(candidates: readonly FeaturedCandidate[], random = Math.random): number {
  const weights = candidates.map((candidate) => featuredWeight(candidate));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0 || !Number.isFinite(total)) return -1;
  let roll = random() * total;
  for (let index = 0; index < weights.length; index++) {
    roll -= weights[index]!;
    if (roll < 0) return index;
  }
  // A random() that lands exactly on 1 still gets an answer: the last one with weight.
  return weights.findLastIndex((weight) => weight > 0);
}
