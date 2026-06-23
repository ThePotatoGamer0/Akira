/** Name Akira uses when addressing the player in WebUI and bot text. */
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
