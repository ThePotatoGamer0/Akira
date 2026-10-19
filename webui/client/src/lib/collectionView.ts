export const COLLECTION_ORDERS = [
  { id: "character", label: "Character name" },
  { id: "series", label: "Series, then character" },
  { id: "quality", label: "Quality" },
  { id: "tag", label: "Tag, then character" },
  { id: "recent", label: "Most recent" },
] as const;

export type CollectionOrder = (typeof COLLECTION_ORDERS)[number]["id"];

export function collectionOrder(value: string | null | undefined): CollectionOrder {
  return COLLECTION_ORDERS.some((option) => option.id === value) ? (value as CollectionOrder) : "character";
}
