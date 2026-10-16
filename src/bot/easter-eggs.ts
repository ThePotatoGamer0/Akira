/**
 * Prefix replies that do nothing else.
 * Add a line as "name": "what Akira says".
 * The name is what comes after the prefix, so `aboop` runs `boop`.
 * A name that is already a real command is left to that command.
 */
export const EASTER_EGGS: Record<string, string> = {
  boop: "Akira blinks. Boop received.",
  hug: "Akira stands very still, then pats your shoulder once.",
  meow: "Akira considers it, then answers with a small meow.",
};

export function easterEgg(name: string, rest: string): string | null {
  if (rest.trim().length > 0) return null;
  return EASTER_EGGS[name.trim().toLowerCase()] ?? null;
}
