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
  frameId: number;
  tag: string | null;
  alias: string | null;
  dye: string | null;
  obtainedAt: string;
  character: { id: string; name: string; slug: string };
  series: { id: string; name: string; slug: string };
  assets: { normal: string; shiny: string; burn: string };
};

export type ShopItem = {
  id: string;
  name: string;
  description: string;
  priceBits: number;
  durationHours: number | null;
};

export type LeaderboardRow = {
  rank: number;
  userId: string;
  discordUsername: string | null;
  bits: number;
  prestigeLevel: number;
  cardCount: number;
};
