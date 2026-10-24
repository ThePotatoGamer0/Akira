/** Name Akira uses when addressing the player in WebUI and bot text. */

export const PREFERRED_NAME_MAX = 15;

/**
 * One word, 15 latin letters at most. Only the first letter may be a capital.
 * Spaces, numbers, symbols, and emoji are dropped. An empty result means there is no custom name.
 */
export function sanitizePreferredName(raw: string): string | null {
  const letters = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z]/g, "")
    .slice(0, PREFERRED_NAME_MAX);
  if (!letters) return null;
  return letters.charAt(0) + letters.slice(1).toLowerCase();
}

export function akiraAddressName(user: {
  preferredName?: string | null;
  discordUsername?: string | null;
}): string {
  const custom = user.preferredName ? sanitizePreferredName(user.preferredName) : null;
  if (custom) return custom;
  const disc = user.discordUsername?.trim();
  if (disc) return disc;
  return "friend";
}
