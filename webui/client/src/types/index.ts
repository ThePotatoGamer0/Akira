export type Me = {
  id: string;
  discordId: string;
  discordUsername: string | null;
  /** Custom name for Akira to use; empty in API means unset. */
  preferredName: string | null;
  /** How the collection opens. The menu on that page can change it for one visit. */
  collectionOrder: string;
  /** Collection skips page buttons and keeps loading 16 cards at a time. */
  continuousScroll: boolean;
  /** Series names: english or romaji. */
  seriesTitle: string;
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
  frames: { id: number; name: string }[];
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

export type CatalogCover = {
  seriesSlug: string;
  characterSlug: string;
  image: string;
  v?: number;
};

export type CatalogSeries = {
  id: string;
  name: string;
  slug: string;
  owned: number;
  total: number;
  percent: number;
  coverUrl: string | null;
  tracked: boolean;
  watchingMissing: boolean;
  lastGot: number | null;
};

export type CatalogCharacterCard = {
  id: string;
  name: string;
  slug: string;
  owned: boolean;
  wishlisted: boolean;
  circulation: number;
  cover: CatalogCover | null;
  lastGot: number | null;
};

export type CatalogSeriesDetail = {
  id: string;
  name: string;
  slug: string;
  owned: number;
  total: number;
  percent: number;
  characters: CatalogCharacterCard[];
};

export type CatalogHolder = {
  cardId: string;
  ownerId: string | null;
  printNumber: number;
  quality: string;
  ownerName: string;
  avatarUrl: string | null;
  mine: boolean;
};

export type CatalogEdition = {
  id: string;
  name: string;
  image: string;
  v?: number;
  generated: number;
  circulation: number;
  byQuality: Record<string, number>;
  holders: CatalogHolder[];
};

export type CatalogCharacterDetail = {
  id: string;
  name: string;
  slug: string;
  series: { id: string; name: string; slug: string };
  owned: boolean;
  wishlisted: boolean;
  wishlistCount: number;
  aliases: string[];
  editions: CatalogEdition[];
};

export type CatalogSearchHit = {
  id: string;
  name: string;
  slug: string;
  series: { name: string; slug: string };
  owned: boolean;
  wishlisted: boolean;
  circulation: number;
  cover: CatalogCover | null;
  lastGot: number | null;
};
