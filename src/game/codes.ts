import { GameError } from "./errors.js";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

export const CARD_CODE_LENGTH = 7;

export function randomCardCode(rng: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < CARD_CODE_LENGTH; i++) {
    code += ALPHABET[Math.floor(rng() * ALPHABET.length)] ?? "0";
  }
  return code;
}

export function isCardCode(value: string): boolean {
  return new RegExp(`^[${ALPHABET}]{${CARD_CODE_LENGTH}}$`).test(value);
}

export async function mintCardCode(taken: (id: string) => Promise<boolean>, rng?: () => number): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const id = randomCardCode(rng);
    if (!(await taken(id))) return id;
  }
  throw new GameError("code", "Akira couldn't mint a card code. Try that grab again.");
}
