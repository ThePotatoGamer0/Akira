/** Keep in sync with `src/utils/akira-address-name.ts` (root). */
export function akiraAddressName(user: {
  preferredName?: string | null;
  discordUsername?: string | null;
}): string {
  const custom = user.preferredName?.trim();
  if (custom) return custom;
  const disc = user.discordUsername?.trim();
  if (disc) return disc;
  return "friend";
}
