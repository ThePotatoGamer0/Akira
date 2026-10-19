/** The WebUI database panel is limited to this Discord account. */
export const HOST_DISCORD_ID = "639906782658953256";

export function userIsAdmin(user: { discordId: string; isAdmin: boolean }): boolean {
  return user.isAdmin || user.discordId === HOST_DISCORD_ID;
}
