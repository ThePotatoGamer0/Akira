import { isCardCode } from "./codes.js";

export type ParsedTradeOffer = {
  cards: string[];
  bits: number;
  /** Parts of the message that were not a card code or a bit amount. */
  unknown: string[];
};

/** `v847vnm, 100 bits` offers that card and 100 bits. A normal sentence is not an offer. */
export function parseTradeOffer(content: string): ParsedTradeOffer | null {
  const parts = content.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
  if (parts.length === 0) return null;
  const cards: string[] = [];
  let bits = 0;
  const unknown: string[] = [];
  for (const part of parts) {
    const bitMatch = /^(\d{1,9})\s+bits?$/i.exec(part);
    if (bitMatch) {
      const amount = Number(bitMatch[1]);
      if (amount >= 1) {
        bits += amount;
        continue;
      }
    }
    const code = part.toLowerCase();
    if (isCardCode(code)) {
      if (!cards.includes(code)) cards.push(code);
      continue;
    }
    unknown.push(part);
  }
  if (cards.length === 0 && bits === 0) return null;
  return { cards, bits, unknown };
}
