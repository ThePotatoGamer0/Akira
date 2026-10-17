export type Me = {
  id: string;
  discordId: string;
  discordUsername: string | null;
  /** Custom name for Akira to use; empty in API means unset. */
  preferredName: string | null;
  /** Resolved: preferredName ?? discordUsername ?? fallback. */
  displayName: string;
  bits: number;
  prestigeLevel: number;
  milestoneCount: number;
  milestoneProgress: number;
  passiveBitsBonus: number;
  isAdmin: boolean;
};

export type CollectionCard = {
  id: string;
  printNumber: number;
  quality: string;
  /** Saved choice. Null means the server default frame. */
  frameChoice: number | null;
  /** Frame actually drawn, after the server default is applied. */
  frameId: number;
  tag: string | null;
  tagEmoji?: string;
  alias: string | null;
  dye: string | null;
  obtainedAt: string;
  variant: { id: string; name: string };
  character: { id: string; name: string; slug: string };
  series: { id: string; name: string; slug: string };
  assets: { normal: string; shiny: string; burn: string };
};

export type CollectionSlice = {
  cards: CollectionCard[];
  total: number;
  owned: number;
  offset: number;
  limit: number;
};

export type CollectionStudio = {
  serverFrame: number;
  /** The signed-in player's frame. Null uses the server frame. */
  personalFrame: number | null;
  frames: number[];
  tags: { name: string; emoji: string; count: number }[];
};

export type ShopItem = {
  id: string;
  name: string;
  description: string;
  priceBits: number;
  durationHours: number | null;
};

export type StatPlayer = { id: string; name: string };

export type CardCountRow = StatPlayer & { count: number };

export type BitsRow = StatPlayer & { bits: number };

export type CompletionRow = {
  seriesId: string;
  name: string;
  owned: number;
  total: number;
  percent: number;
  tracked: boolean;
};

export type CompletionStats = {
  user: StatPlayer;
  players: StatPlayer[];
  mode: "tracked" | "top";
  bars: CompletionRow[];
  top: CompletionRow[];
  tracked: CompletionRow[];
  series: CompletionRow[];
};
