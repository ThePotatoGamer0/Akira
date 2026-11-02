import { prisma } from "../db/client.js";
import { BURN_BITS, MAX_TRADE_BITS, TRADE_DAILY_PAIR_VALUE, type Quality } from "./balance.js";

function isQuality(value: string): value is Quality {
  return (Object.keys(BURN_BITS) as string[]).includes(value);
}

/** Beyond this the larger side of a two-sided trade is a warn. */
export const WARN_RATIO = 2;
/** Beyond this, and past `BLOCK_MIN_VALUE`, it is a block. */
export const BLOCK_RATIO = 5;
export const BLOCK_MIN_VALUE = 2000;

/** Worn prints are worth a little more, in whole percent off the base value. */
const PRINT_BONUS_BASE = 10;
const PRINT_BONUS_CAP = 8;

export type FairnessLevel = "fair" | "warn" | "block";

/** A card on offer. The variant is looked up beside it; bits sit in the same line they were offered on. */
export type ValueItem = { bits: number; card: { quality: string; printNumber: number } | null };

export type Fairness = {
  level: FairnessLevel;
  /** Larger side divided by smaller. Zero when there is nothing to compare. */
  ratio: number;
  /** One line for the embed. Empty when fair. */
  note: string;
};

/** What one card is worth in points: its quality, a mint bonus, and a print-number nudge. */
export function cardValue(quality: string, printNumber: number, supply: number): number {
  const base = isQuality(quality) ? BURN_BITS[quality] : BURN_BITS.COMMON;
  const mint = supply > 0 ? 1 + 1 / Math.sqrt(supply) : 1;
  const low = Math.min(PRINT_BONUS_CAP, Math.max(0, PRINT_BONUS_BASE - Math.floor(printNumber / 10)));
  return Math.round(base * mint * (1 + low / 100));
}

export function bitsValue(bits: number): number {
  return Math.max(0, Math.round(bits));
}

export function sideValue(cards: readonly number[], bits: number): number {
  return cards.reduce((sum, value) => sum + value, bitsValue(bits));
}

/** A gift is one side with nothing on it. Those are always fair, whatever their size. */
export function isGift(fromValue: number, toValue: number): boolean {
  return fromValue === 0 || toValue === 0;
}

export function fairness(fromValue: number, toValue: number): Fairness {
  if (isGift(fromValue, toValue)) return { level: "fair", ratio: 0, note: "" };
  const larger = Math.max(fromValue, toValue);
  const smaller = Math.min(fromValue, toValue);
  const ratio = larger / smaller;
  if (ratio > BLOCK_RATIO && larger >= BLOCK_MIN_VALUE) {
    return {
      level: "block",
      ratio: Math.round(ratio * 10) / 10,
      note: `This trade is lopsided: one side is about ${Math.round(ratio)}x the other. Akira won't complete it.`,
    };
  }
  if (ratio > WARN_RATIO) {
    return {
      level: "warn",
      ratio: Math.round(ratio * 10) / 10,
      note: `Heads up: one side is about ${Math.round(ratio)}x the other. Make sure you both meant that.`,
    };
  }
  return { level: "fair", ratio: Math.round(ratio * 10) / 10, note: "" };
}

/** New players get a bigger daily until they have a collection or some time in. */
export const CATCH_UP_CARDS = 250;
export const CATCH_UP_DAYS = 30;
export const CATCH_UP_MULTIPLIER = 1.5;

export function catchUpMultiplier(cardCount: number, daysSinceFirstSeen: number): number {
  if (cardCount >= CATCH_UP_CARDS || daysSinceFirstSeen >= CATCH_UP_DAYS) return 1;
  const spare = CATCH_UP_MULTIPLIER - 1;
  // Half the bonus comes off as the collection grows, half as the first month passes;
  // whichever runs out first ends it. A brand new player gets the full 1.5x.
  const byCards = CATCH_UP_MULTIPLIER - spare * (cardCount / CATCH_UP_CARDS);
  const byDays = CATCH_UP_MULTIPLIER - spare * (daysSinceFirstSeen / CATCH_UP_DAYS);
  return Math.max(1, Math.min(byCards, byDays));
}

async function supplyOf(keys: Array<{ variantId: string; printNumber: number }>): Promise<(key: string) => number> {
  if (keys.length === 0) return () => 1;
  const variants = [...new Set(keys.map((key) => key.variantId))];
  const rows = await prisma.card.groupBy({
    by: ["variantId", "printNumber"],
    where: { variantId: { in: variants } },
    _count: { _all: true },
  });
  const supply = new Map(rows.map((row) => [`${row.variantId}#${row.printNumber}`, row._count._all]));
  return (key) => supply.get(key) ?? 1;
}

/**
 * Both sides of one lot of trade items, priced. A card's supply is its variant and print,
 * so the first copy of an art is worth more than the tenth.
 */
export async function lotValues(lots: Array<{ items: readonly ValueItem[]; variantOf: (index: number) => string }>): Promise<number[]> {
  const keys = lots.flatMap((lot) =>
    lot.items.flatMap((item, index) => (item.card ? [{ variantId: lot.variantOf(index), printNumber: item.card.printNumber }] : [])),
  );
  const supply = await supplyOf(keys);
  return lots.map((lot) =>
    sideValue(
      lot.items.map((item, index) => (item.card ? cardValue(item.card.quality, item.card.printNumber, supply(`${lot.variantOf(index)}#${item.card.printNumber}`)) : 0)),
      lot.items.reduce((sum, item) => sum + item.bits, 0),
    ),
  );
}

/** Points between these two players since UTC midnight, both directions. Done trades and done offers. */
export async function pairValueToday(a: string, b: string, now = new Date()): Promise<number> {
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const [trades, offers] = await Promise.all([
    prisma.multitrade.findMany({
      where: {
        status: "done",
        updatedAt: { gte: midnight },
        OR: [
          { fromUserId: a, toUserId: b },
          { fromUserId: b, toUserId: a },
        ],
      },
      select: { value: true },
    }),
    prisma.transferOffer.findMany({
      where: {
        status: "done",
        createdAt: { gte: midnight },
        OR: [
          { fromUserId: a, toUserId: b },
          { fromUserId: b, toUserId: a },
        ],
      },
      select: { value: true },
    }),
  ]);
  return [...trades, ...offers].reduce((sum, row) => sum + row.value, 0);
}

export type TradeVerdict = {
  fromValue: number;
  toValue: number;
  fairness: Fairness;
  /** Points already traded with this player today, both directions. */
  pairValue: number;
  /** The pair budget left after this trade, never below zero. */
  remaining: number;
};

type EntryWithVariant = { userId: string; bits: number; card: { variantId: string; quality: string; printNumber: number } | null };

async function readEntries(tradeId: string): Promise<EntryWithVariant[]> {
  return prisma.multitradeEntry.findMany({
    where: { tradeId },
    include: { card: { select: { variantId: true, quality: true, printNumber: true } } },
  });
}

/** Priced from entries already in hand, and a pair value already read (a transaction cannot re-read it). */
export async function verdictFromEntries(
  trade: { fromUserId: string; toUserId: string },
  rows: EntryWithVariant[],
  pairValue: number,
): Promise<TradeVerdict> {
  const itemOf = (entry: EntryWithVariant): ValueItem => ({
    bits: entry.bits,
    card: entry.card ? { quality: entry.card.quality, printNumber: entry.card.printNumber } : null,
  });
  const from = rows.filter((entry) => entry.userId === trade.fromUserId);
  const to = rows.filter((entry) => entry.userId === trade.toUserId);
  const [fromValue = 0, toValue = 0] = await lotValues([
    { items: from.map(itemOf), variantOf: (index) => from[index]?.card?.variantId ?? "" },
    { items: to.map(itemOf), variantOf: (index) => to[index]?.card?.variantId ?? "" },
  ]);
  const budget = pairBudget(pairValue, Math.max(fromValue, toValue));
  return {
    fromValue,
    toValue,
    fairness: fairness(fromValue, toValue),
    pairValue,
    remaining: budget.remaining,
  };
}

/** What each side of a multitrade is worth, and whether that is fair. Reads its own entries. */
export async function multitradeVerdict(trade: { id: string; fromUserId: string; toUserId: string }): Promise<TradeVerdict> {
  const rows = await readEntries(trade.id);
  const pairValue = await pairValueToday(trade.fromUserId, trade.toUserId);
  return verdictFromEntries(trade, rows, pairValue);
}

/** The same verdict for one multitrade entry list, without the pair budget (offers carry no value yet). */
export async function entriesVerdict(
  trade: { fromUserId: string; toUserId: string },
  rows: EntryWithVariant[],
): Promise<{ fromValue: number; toValue: number; fairness: Fairness }> {
  const verdict = await verdictFromEntries(trade, rows, 0);
  return { fromValue: verdict.fromValue, toValue: verdict.toValue, fairness: verdict.fairness };
}

/** What each side of a two-card offer (a give or a card trade) is worth. */
export async function offerVerdict(
  from: { bits: 0; card: { variantId: string; quality: string; printNumber: number } | null },
  to: { bits: 0; card: { variantId: string; quality: string; printNumber: number } | null },
): Promise<{ fromValue: number; toValue: number; fairness: Fairness }> {
  const [fromValue = 0, toValue = 0] = await lotValues([
    { items: [{ bits: from.bits, card: from.card }], variantOf: () => from.card?.variantId ?? "" },
    { items: [{ bits: to.bits, card: to.card }], variantOf: () => to.card?.variantId ?? "" },
  ]);
  return { fromValue, toValue, fairness: fairness(fromValue, toValue) };
}

/** The pair budget check: already traded today plus this trade against the daily allowance. */
export function pairBudget(pairValue: number, thisTrade: number): { over: boolean; remaining: number; note: string } {
  const used = pairValue + thisTrade;
  const remaining = Math.max(0, TRADE_DAILY_PAIR_VALUE - used);
  if (used <= TRADE_DAILY_PAIR_VALUE) return { over: false, remaining, note: "" };
  return {
    over: true,
    remaining: 0,
    note: `You two have already traded ${pairValue} points today, and ${thisTrade} more would pass the daily ${TRADE_DAILY_PAIR_VALUE}.`,
  };
}

/** Bits one side may put up: capped only once the other side has something on it. */
export function bitsCapNote(bits: number, otherSideEmpty: boolean): string | null {
  if (otherSideEmpty || bits <= MAX_TRADE_BITS) return null;
  return `A trade between two players tops out at ${MAX_TRADE_BITS} bits. Give bits with nothing asked back, and there is no cap.`;
}