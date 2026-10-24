import type { ComponentType } from "react";
import type { Me } from "../../types/index.js";
import { CardsStat } from "./CardsStat.js";
import { CompletionStat } from "./CompletionStat.js";
import { EconomyStat } from "./EconomyStat.js";

export type StatFetch = (path: string, init?: RequestInit) => Promise<Response>;

export type StatPlace = "feature" | "wide" | "tile";

type StatCard = {
  id: string;
  /** feature is the tall left card, wide sits beside it, tile is half of the next row. */
  place: StatPlace;
  Component: ComponentType<{ me: Me; fetchApi: StatFetch; liveRev?: number }>;
};

/**
 * Add a stat by appending an entry and giving it a component.
 * The page lays these out in order. It does not need to know what each card shows.
 */
export const statCards: StatCard[] = [
  { id: "cards", place: "feature", Component: CardsStat },
  { id: "completion", place: "wide", Component: CompletionStat },
  { id: "economy", place: "wide", Component: EconomyStat },
];
