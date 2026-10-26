import { prisma } from "../db/client.js";
import { sanitizeDiscordAvatarHash } from "../utils/discord-avatar.js";

/** Keep DB discordUsername and avatar in sync for the WebUI. */
export async function syncDiscordUsernameForWebUi(
  discordId: string,
  username: string,
  avatar?: string | null,
): Promise<void> {
  const norm = username.trim().toLowerCase();
  const hash = avatar === undefined ? undefined : (sanitizeDiscordAvatarHash(avatar) ?? "");
  if (!norm && hash === undefined) return;

  await prisma.user.upsert({
    where: { discordId },
    create: {
      discordId,
      discordUsername: norm || null,
      ...(hash !== undefined ? { discordAvatar: hash } : {}),
    },
    update: {
      ...(norm ? { discordUsername: norm } : {}),
      ...(hash !== undefined ? { discordAvatar: hash } : {}),
    },
  });
}
