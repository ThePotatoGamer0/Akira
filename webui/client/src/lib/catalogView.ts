export const CATALOG_ORDERS = [
  { id: "completion", label: "Completion" },
  { id: "alpha", label: "Alphabetical" },
  { id: "recent", label: "Most recently collected" },
] as const;

export type CatalogOrder = (typeof CATALOG_ORDERS)[number]["id"];

export function catalogOrder(value: string | null | undefined): CatalogOrder {
  return CATALOG_ORDERS.some((option) => option.id === value) ? (value as CatalogOrder) : "completion";
}

type SeriesRow = {
  id: string;
  tracked: boolean;
  percent: number;
  name: string;
  lastGot?: number | null;
};

type CharacterRow = {
  owned: boolean;
  name: string;
  lastGot?: number | null;
};

function compareName(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function compareRecent(a: number | null | undefined, b: number | null | undefined): number {
  return (b ?? 0) - (a ?? 0);
}

export function sortCatalogSeries<T extends SeriesRow>(rows: T[], order: CatalogOrder): T[] {
  const pinOrder = rows.filter((row) => row.tracked).map((row) => row.id);
  const pins = new Map(pinOrder.map((id, index) => [id, index]));
  return rows.slice().sort((a, b) => {
    const aPin = a.tracked ? (pins.get(a.id) ?? 0) : Number.POSITIVE_INFINITY;
    const bPin = b.tracked ? (pins.get(b.id) ?? 0) : Number.POSITIVE_INFINITY;
    if (aPin !== bPin) return aPin - bPin;
    if (order === "alpha") return compareName(a.name, b.name);
    if (order === "recent") return compareRecent(a.lastGot, b.lastGot) || compareName(a.name, b.name);
    return b.percent - a.percent || compareName(a.name, b.name);
  });
}

export function sortCatalogCharacters<T extends CharacterRow>(rows: T[], order: CatalogOrder): T[] {
  return rows.slice().sort((a, b) => {
    if (order === "alpha") return compareName(a.name, b.name);
    if (order === "recent") return compareRecent(a.lastGot, b.lastGot) || compareName(a.name, b.name);
    return Number(a.owned) - Number(b.owned) || compareName(a.name, b.name);
  });
}

export function applyCatalogTrack<T extends SeriesRow>(
  rows: T[],
  seriesId: string,
  tracked: boolean,
  order: CatalogOrder,
): T[] {
  const pinOrder = rows.filter((row) => row.tracked && row.id !== seriesId).map((row) => row.id);
  if (tracked) pinOrder.push(seriesId);
  const pins = new Map(pinOrder.map((id, index) => [id, index]));
  return rows
    .map((row) => (row.id === seriesId ? { ...row, tracked } : row))
    .slice()
    .sort((a, b) => {
      const aPin = a.tracked ? (pins.get(a.id) ?? 0) : Number.POSITIVE_INFINITY;
      const bPin = b.tracked ? (pins.get(b.id) ?? 0) : Number.POSITIVE_INFINITY;
      if (aPin !== bPin) return aPin - bPin;
      if (order === "alpha") return compareName(a.name, b.name);
      if (order === "recent") return compareRecent(a.lastGot, b.lastGot) || compareName(a.name, b.name);
      return b.percent - a.percent || compareName(a.name, b.name);
    });
}
